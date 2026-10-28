-- Moga ERP — server operations, part 3: money in and out that isn't a sale.
--
-- Each function works out the effect on the drawer, the wallet, the bank, the machines and the agents'
-- accounts itself, from the amount and the way it was paid; the app only says what happened.

-- ---------------------------------------------------------------- expenses and the owner's money

create function public.record_expense(p_category text, p_amount numeric, p_note text default null) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff := private.me();
  v_shift uuid := private.work_shift(v_me);
  v_amount numeric := private.amount(p_amount);
  v_category text := btrim(coalesce(p_category, ''));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_category = '' then
    raise exception 'اختار البند';
  end if;
  return private.add_movement(v_me, v_shift, 'expense', v_category || coalesce(' — ' || v_note, ''),
    p_cash => -v_amount, p_category => v_category);
end $$;

-- An advance to an employee from the drawer; it's deducted from their next salary.
create function public.record_employee_advance(p_employee_id uuid, p_amount numeric) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff := private.me();
  v_shift uuid := private.work_shift(v_me);
  v_amount numeric := private.amount(p_amount);
  v_name text;
begin
  select name into v_name from public.staff
   where id = p_employee_id and branch_id = v_me.branch_id and role = 'employee' and active;
  if not found then
    raise exception 'اختار الموظف';
  end if;
  return private.add_movement(v_me, v_shift, 'employee_advance', 'سلفة ' || v_name,
    p_cash => -v_amount, p_target_employee_id => p_employee_id);
end $$;

-- The owner's own money in and out of the drawer: capital in, drawings, the جمعية, buying a fixed asset.
create function public.record_owner_movement(p_kind text, p_amount numeric, p_note text default null) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff := private.me();
  v_shift uuid;
  v_amount numeric;
  v_sign integer := case p_kind
    when 'owner_contribution' then 1
    when 'savings_collection' then 1
    when 'owner_drawing' then -1
    when 'savings_payment' then -1
    when 'asset_purchase' then -1
  end;
begin
  perform private.require_owner(v_me);
  v_shift := private.work_shift(v_me);
  v_amount := private.amount(p_amount);
  if v_sign is null then
    raise exception 'نوع الحركة غلط';
  end if;
  return private.add_movement(v_me, v_shift, p_kind,
    coalesce(nullif(btrim(coalesce(p_note, '')), ''), private.ledger_label(p_kind)), p_cash => v_sign * v_amount);
end $$;

-- ---------------------------------------------------------------- Vodafone Cash, Fawry and Momkn for customers

-- What the amount means, as on the screen:
--   vf_deposit          sent from the shop's wallet to the customer; the fee comes on top, in cash
--   vf_withdrawal       the customer sent it to the shop's wallet; the fee is kept from the cash handed over
--   topup_sale          everything the customer paid, fee included; the machine balance drops by the rest
--   wallet_liquidation  taken out of the wallet into the drawer; the fee is an expense
create function public.record_service_operation(
  p_kind text, p_amount numeric, p_fee numeric default 0, p_balance_id text default null, p_phone text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff := private.me();
  v_shift uuid := private.work_shift(v_me);
  v_amount numeric := private.amount(p_amount);
  v_fee numeric := round(coalesce(p_fee, 0), 2);
  v_description text := private.ledger_label(p_kind) || coalesce(' — ' || nullif(btrim(coalesce(p_phone, '')), ''), '');
begin
  if v_fee < 0 then
    raise exception 'العمولة مينفعش تبقى بالسالب';
  end if;
  -- The fee can't be more than the amount, except a deposit's, which comes on top.
  if p_kind <> 'vf_deposit' and v_fee > v_amount then
    raise exception 'العمولة أكبر من المبلغ';
  end if;
  case p_kind
    when 'vf_deposit' then
      return private.add_movement(v_me, v_shift, p_kind, v_description,
        p_cash => v_amount + v_fee, p_wallet => -v_amount, p_commission => v_fee);
    when 'vf_withdrawal' then
      return private.add_movement(v_me, v_shift, p_kind, v_description,
        p_cash => v_fee - v_amount, p_wallet => v_amount, p_commission => v_fee);
    when 'topup_sale' then
      if private.balance_company(p_balance_id) is null then
        raise exception 'اختار الماكينة';
      end if;
      return private.add_movement(v_me, v_shift, p_kind, v_description,
        p_cash => v_amount, p_topup => v_fee - v_amount, p_commission => v_fee,
        p_machine_id => private.balance_company(p_balance_id), p_balance_id => p_balance_id);
    when 'wallet_liquidation' then
      return private.add_movement(v_me, v_shift, p_kind, v_description,
        p_cash => v_amount - v_fee, p_wallet => -v_amount, p_commission => -v_fee);
    else
      raise exception 'نوع العملية غلط';
  end case;
end $$;

-- ---------------------------------------------------------------- agents (مندوب فوري / ممكن)

-- The agent loaded a machine balance on credit: the agent's account moves by what the shop will pay, and
-- Fawry's Air time bonus is extra balance on the machine that counts as profit. Can be recorded in the
-- morning before the shift opens. Returns how much the balance went up.
create function public.record_agent_load(p_machine_id text, p_balance_id text, p_amount numeric) returns numeric
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff := private.me();
  v_shift uuid := private.work_shift(v_me, p_employee_needs_shift => false);
  v_amount numeric := private.amount(p_amount);
  v_bonus numeric;
begin
  if coalesce(p_machine_id, '') not in ('fawry', 'momkn') or private.balance_company(p_balance_id) is distinct from p_machine_id then
    raise exception 'اختار المندوب والحساب اللي اتشحن';
  end if;
  select round(v_amount * coalesce((bonus_percent ->> p_balance_id)::numeric, 0) / 100) into v_bonus
    from public.settings where branch_id = v_me.branch_id;
  perform private.add_movement(v_me, v_shift, 'rep_load',
    'مندوب ' || private.machine_label(p_machine_id) || ' شحن ' || private.balance_label(p_balance_id) || ' ' || private.fmt(v_amount),
    p_topup => v_amount + v_bonus, p_commission => v_bonus,
    p_machine_id => p_machine_id, p_balance_id => p_balance_id, p_rep => -v_amount);
  return v_amount + v_bonus;
end $$;

-- Paying an agent (part of) what the shop owes for loads. By Vodafone Cash the agent charges a liquidation
-- fee on top (a percentage in settings): it leaves the wallet too and is an expense.
-- p_method: cash (from the drawer), wallet (Vodafone Cash) or instapay (the bank).
create function public.record_agent_payment(p_machine_id text, p_amount numeric, p_method text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff := private.me();
  v_shift uuid := private.work_shift(v_me);
  v_amount numeric := private.amount(p_amount);
  v_owed numeric;
  v_fee numeric := 0;
begin
  if coalesce(p_machine_id, '') not in ('fawry', 'momkn') then
    raise exception 'اختار المندوب';
  end if;
  if coalesce(p_method, '') not in ('cash', 'wallet', 'instapay') then
    raise exception 'اختار طريقة الدفع';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('agent:' || v_me.branch_id || ':' || p_machine_id, 0));
  v_owed := greatest(0, -private.rep_balance(v_me.branch_id, p_machine_id));
  if v_amount > v_owed then
    raise exception 'أكتر من اللي عليك للمندوب (%)', private.fmt(v_owed);
  end if;
  if p_method = 'wallet' then
    select round(v_amount * agent_vf_fee_percent / 100) into v_fee from public.settings where branch_id = v_me.branch_id;
  end if;
  return private.add_movement(v_me, v_shift, 'rep_payment',
    'دفع لمندوب ' || private.machine_label(p_machine_id) || ' — '
      || case p_method when 'cash' then 'كاش من الدرج' when 'wallet' then 'فودافون كاش' else 'إنستاباي' end
      || case when v_fee > 0 then ' + رسوم تسييل ' || private.fmt(v_fee) else '' end,
    p_cash => case when p_method = 'cash' then -v_amount else 0 end,
    p_wallet => case when p_method = 'wallet' then -(v_amount + v_fee) else 0 end,
    p_bank => case when p_method = 'instapay' then -v_amount else 0 end,
    p_commission => -v_fee, p_machine_id => p_machine_id, p_rep => v_amount);
end $$;

-- ---------------------------------------------------------------- the shop borrowing (سلفة خارجية)

-- The shop borrowed money from someone. Returns the loan's id.
create function public.receive_loan(p_name text, p_phone text, p_amount numeric, p_notes text default null) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff := private.me();
  v_shift uuid := private.work_shift(v_me);
  v_amount numeric := private.amount(p_amount);
  v_lender uuid;
  v_loan uuid;
begin
  if btrim(coalesce(p_phone, '')) = '' then
    raise exception 'اكتب تليفون المُقرض';
  end if;
  v_lender := private.upsert_contact(v_me.branch_id, 'lender', p_name, p_phone);
  insert into public.loans (branch_id, lender_id, amount, received_by, notes)
  values (v_me.branch_id, v_lender, v_amount, v_me.id, nullif(btrim(coalesce(p_notes, '')), ''))
  returning id into v_loan;
  perform private.add_movement(v_me, v_shift, 'loan_received', 'سلفة من ' || btrim(p_name),
    p_cash => v_amount, p_contact_id => v_lender);
  return v_loan;
end $$;

-- The shop pays back (part of) one loan.
create function public.repay_loan(p_loan_id uuid, p_amount numeric, p_via text default 'cash', p_note text default null) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff := private.me();
  v_shift uuid := private.work_shift(v_me);
  v_amount numeric := private.amount(p_amount);
  v_loan public.loans;
  v_left numeric;
begin
  if coalesce(p_via, '') not in ('cash', 'wallet') then
    raise exception 'اختار الفلوس طالعة منين';
  end if;
  select * into v_loan from public.loans where id = p_loan_id and branch_id = v_me.branch_id for update;
  if not found then
    raise exception 'السلفة مش موجودة';
  end if;
  v_left := v_loan.amount - v_loan.repaid - v_loan.forgiven;
  if v_amount > v_left then
    raise exception 'أكتر من اللي على المحل له (%)', private.fmt(v_left);
  end if;
  update public.loans set repaid = repaid + v_amount where id = v_loan.id;
  insert into public.loan_events (loan_id, type, amount, recorded_by, via, note)
  values (v_loan.id, 'repaid', v_amount, v_me.id, p_via, nullif(btrim(coalesce(p_note, '')), ''));
  perform private.add_movement(v_me, v_shift, 'loan_repayment',
    'سداد لـ ' || (select name from public.contacts where id = v_loan.lender_id),
    p_cash => case when p_via = 'cash' then -v_amount else 0 end,
    p_wallet => case when p_via = 'wallet' then -v_amount else 0 end,
    p_contact_id => v_loan.lender_id);
end $$;

-- What the shop owes a lender, settled oldest loan first: the shop repays it (p_type 'repaid', from the
-- drawer or the wallet), or the lender lets the shop off (p_type 'forgiven', the owner only; no money moves).
create function public.settle_loan(
  p_lender_id uuid, p_amount numeric, p_type text, p_via text default 'cash', p_note text default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff := private.me();
  v_shift uuid := private.work_shift(v_me);
  v_amount numeric := private.amount(p_amount);
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_left numeric := v_amount;
  v_take numeric;
  v_loan public.loans;
begin
  if coalesce(p_type, '') not in ('repaid', 'forgiven') then
    raise exception 'نوع التسوية غلط';
  end if;
  if p_type = 'forgiven' then
    perform private.require_owner(v_me);
  elsif coalesce(p_via, '') not in ('cash', 'wallet') then
    raise exception 'اختار الفلوس طالعة منين';
  end if;
  for v_loan in
    select * from public.loans
     where lender_id = p_lender_id and branch_id = v_me.branch_id and amount > repaid + forgiven
     order by received_at, id
       for update
  loop
    v_take := least(v_left, v_loan.amount - v_loan.repaid - v_loan.forgiven);
    update public.loans
       set repaid = repaid + case when p_type = 'repaid' then v_take else 0 end,
           forgiven = forgiven + case when p_type = 'forgiven' then v_take else 0 end
     where id = v_loan.id;
    insert into public.loan_events (loan_id, type, amount, recorded_by, via, note)
    values (v_loan.id, p_type, v_take, v_me.id, case when p_type = 'repaid' then p_via end, v_note);
    v_left := v_left - v_take;
    exit when v_left = 0;
  end loop;
  if v_left > 0 then
    raise exception 'المبلغ أكتر من اللي على المحل له';
  end if;
  if p_type = 'repaid' then
    perform private.add_movement(v_me, v_shift, 'loan_repayment',
      'سداد لـ ' || (select name from public.contacts where id = p_lender_id),
      p_cash => case when p_via = 'cash' then -v_amount else 0 end,
      p_wallet => case when p_via = 'wallet' then -v_amount else 0 end,
      p_contact_id => p_lender_id);
  end if;
end $$;

-- ---------------------------------------------------------------- the shop lending (سلفة لحد)

-- Shop money lent to someone (a neighbour, a friend), expected back by p_due_date. An employee can lend up
-- to the limit in settings; more needs the owner. Returns the loan's id.
create function public.lend_money(
  p_name text, p_phone text, p_amount numeric, p_due_date date, p_via text default 'cash', p_notes text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff := private.me();
  v_shift uuid := private.work_shift(v_me);
  v_amount numeric := private.amount(p_amount);
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_limit numeric;
  v_borrower uuid;
  v_id uuid;
begin
  if coalesce(p_via, '') not in ('cash', 'wallet') then
    raise exception 'اختار الفلوس طالعة منين';
  end if;
  if p_due_date is null then
    raise exception 'اكتب هيرجّعها إمتى';
  end if;
  if v_me.role <> 'admin' then
    select employee_lend_limit into v_limit from public.settings where branch_id = v_me.branch_id;
    if v_amount > v_limit then
      raise exception 'أكتر من % محتاج المالك يسجّلها', private.fmt(v_limit) using errcode = '42501';
    end if;
  end if;
  v_borrower := private.upsert_contact(v_me.branch_id, 'borrower', p_name, p_phone);
  insert into public.lent_out (branch_id, borrower_id, amount, due_date, given_by, notes)
  values (v_me.branch_id, v_borrower, v_amount, p_due_date, v_me.id, v_notes)
  returning id into v_id;
  perform private.add_movement(v_me, v_shift, 'lent_out', 'سلفة لـ ' || btrim(p_name) || coalesce(' — ' || v_notes, ''),
    p_cash => case when p_via = 'cash' then -v_amount else 0 end,
    p_wallet => case when p_via = 'wallet' then -v_amount else 0 end,
    p_contact_id => v_borrower);
  return v_id;
end $$;

-- Someone pays back (part of) one loan they took from the shop.
create function public.collect_lent(p_lent_id uuid, p_amount numeric, p_via text default 'cash', p_note text default null) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff := private.me();
  v_shift uuid := private.work_shift(v_me);
  v_amount numeric := private.amount(p_amount);
  v_lent public.lent_out;
  v_left numeric;
begin
  if coalesce(p_via, '') not in ('cash', 'wallet') then
    raise exception 'اختار الفلوس دخلت فين';
  end if;
  select * into v_lent from public.lent_out where id = p_lent_id and branch_id = v_me.branch_id for update;
  if not found then
    raise exception 'السلفة مش موجودة';
  end if;
  v_left := v_lent.amount - v_lent.repaid - v_lent.forgiven;
  if v_amount > v_left then
    raise exception 'أكتر من اللي عليه (%)', private.fmt(v_left);
  end if;
  update public.lent_out set repaid = repaid + v_amount where id = v_lent.id;
  insert into public.lent_events (lent_id, type, amount, recorded_by, via, note)
  values (v_lent.id, 'repaid', v_amount, v_me.id, p_via, nullif(btrim(coalesce(p_note, '')), ''));
  perform private.add_movement(v_me, v_shift, 'lent_repaid',
    (select name from public.contacts where id = v_lent.borrower_id) || ' رجّع ' || private.fmt(v_amount),
    p_cash => case when p_via = 'cash' then v_amount else 0 end,
    p_wallet => case when p_via = 'wallet' then v_amount else 0 end,
    p_contact_id => v_lent.borrower_id);
end $$;

-- What someone owes the shop, settled oldest loan first: they repay it (p_type 'repaid', into the drawer or
-- the wallet), or the owner forgives it (p_type 'forgiven': a loss in the net profit; no money moves).
create function public.settle_lent(
  p_borrower_id uuid, p_amount numeric, p_type text, p_via text default 'cash', p_note text default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff := private.me();
  v_shift uuid := private.work_shift(v_me);
  v_amount numeric := private.amount(p_amount);
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_left numeric := v_amount;
  v_take numeric;
  v_lent public.lent_out;
begin
  if coalesce(p_type, '') not in ('repaid', 'forgiven') then
    raise exception 'نوع التسوية غلط';
  end if;
  if p_type = 'forgiven' then
    perform private.require_owner(v_me);
  elsif coalesce(p_via, '') not in ('cash', 'wallet') then
    raise exception 'اختار الفلوس دخلت فين';
  end if;
  for v_lent in
    select * from public.lent_out
     where borrower_id = p_borrower_id and branch_id = v_me.branch_id and amount > repaid + forgiven
     order by given_at, id
       for update
  loop
    v_take := least(v_left, v_lent.amount - v_lent.repaid - v_lent.forgiven);
    update public.lent_out
       set repaid = repaid + case when p_type = 'repaid' then v_take else 0 end,
           forgiven = forgiven + case when p_type = 'forgiven' then v_take else 0 end
     where id = v_lent.id;
    insert into public.lent_events (lent_id, type, amount, recorded_by, via, note)
    values (v_lent.id, p_type, v_take, v_me.id, case when p_type = 'repaid' then p_via end, v_note);
    v_left := v_left - v_take;
    exit when v_left = 0;
  end loop;
  if v_left > 0 then
    raise exception 'المبلغ أكتر من اللي عليه';
  end if;
  if p_type = 'repaid' then
    perform private.add_movement(v_me, v_shift, 'lent_repaid',
      (select name from public.contacts where id = p_borrower_id) || ' رجّع ' || private.fmt(v_amount),
      p_cash => case when p_via = 'cash' then v_amount else 0 end,
      p_wallet => case when p_via = 'wallet' then v_amount else 0 end,
      p_contact_id => p_borrower_id);
  end if;
end $$;

-- ---------------------------------------------------------------- customers' accounts and installments

-- A customer pays (part of) what's on their account (آجل) from sales they didn't pay in full.
create function public.collect_credit(p_customer_id uuid, p_amount numeric, p_via text default 'cash') returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff := private.me();
  v_shift uuid := private.work_shift(v_me);
  v_amount numeric := private.amount(p_amount);
  v_name text;
  v_owed numeric;
begin
  if coalesce(p_via, '') not in ('cash', 'wallet') then
    raise exception 'اختار الفلوس دخلت فين';
  end if;
  select name into v_name from public.contacts
   where id = p_customer_id and branch_id = v_me.branch_id and kind = 'customer'
     for update;
  if not found then
    raise exception 'الزبون مش موجود';
  end if;
  v_owed := private.credit_balance(p_customer_id);
  if v_amount > v_owed then
    raise exception 'أكتر من اللي عليه (%)', private.fmt(greatest(v_owed, 0));
  end if;
  return private.add_movement(v_me, v_shift, 'credit_collection', v_name || ' دفع من حسابه ' || private.fmt(v_amount),
    p_cash => case when p_via = 'cash' then v_amount else 0 end,
    p_wallet => case when p_via = 'wallet' then v_amount else 0 end,
    p_contact_id => p_customer_id);
end $$;

-- An installment payment: a full installment, part of one or more than one — it goes to the oldest due
-- first. The markup is earned as it's collected: each payment carries its share of it (the cash-price
-- profit counted on the sale day). p_method: cash or vodafone_cash.
create function public.pay_installment(p_plan_id uuid, p_amount numeric, p_method text default 'cash') returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff := private.me();
  v_shift uuid := private.work_shift(v_me);
  v_amount numeric := private.amount(p_amount);
  v_plan public.installment_plans;
  v_left numeric;
  v_rest numeric := v_amount;
  v_take numeric;
  v_due record;
  v_markup numeric;
begin
  if coalesce(p_method, '') not in ('cash', 'vodafone_cash') then
    raise exception 'اختار طريقة الدفع';
  end if;
  select * into v_plan from public.installment_plans where id = p_plan_id and branch_id = v_me.branch_id for update;
  if not found then
    raise exception 'خطة التقسيط مش موجودة';
  end if;
  if v_plan.cancelled_at is not null then
    raise exception 'الفاتورة دي اترجعت — مفيش أقساط عليها';
  end if;
  select coalesce(sum(amount - paid), 0) into v_left from public.installment_dues where plan_id = v_plan.id;
  if v_amount > v_left then
    raise exception 'أكتر من الباقي على الزبون (%)', private.fmt(v_left);
  end if;
  for v_due in
    select n, amount - paid as due from public.installment_dues
     where plan_id = v_plan.id and paid < amount
     order by n
  loop
    v_take := least(v_rest, v_due.due);
    update public.installment_dues set paid = paid + v_take where plan_id = v_plan.id and n = v_due.n;
    v_rest := v_rest - v_take;
    exit when v_rest = 0;
  end loop;
  v_markup := round(v_amount * v_plan.markup_percent / (100 + v_plan.markup_percent));
  return private.add_movement(v_me, v_shift, 'installment_collection',
    'قسط ' || (select name from public.contacts where id = v_plan.customer_id)
      || case when v_markup > 0 then ' (منه ربح زيادة ' || private.fmt(v_markup) || ')' else '' end,
    p_cash => case when p_method = 'cash' then v_amount else 0 end,
    p_wallet => case when p_method = 'vodafone_cash' then v_amount else 0 end,
    p_commission => v_markup, p_plan_id => v_plan.id, p_contact_id => v_plan.customer_id);
end $$;

-- ---------------------------------------------------------------- suppliers and salaries

-- Paying a supplier (part of) what the shop owes them. p_via: cash, wallet or bank (InstaPay).
create function public.pay_supplier(p_supplier_id uuid, p_amount numeric, p_via text default 'cash', p_note text default null) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff := private.me();
  v_shift uuid := private.work_shift(v_me);
  v_amount numeric := private.amount(p_amount);
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_name text;
  v_owed numeric;
begin
  if coalesce(p_via, '') not in ('cash', 'wallet', 'bank') then
    raise exception 'اختار الفلوس طالعة منين';
  end if;
  select name into v_name from public.contacts
   where id = p_supplier_id and branch_id = v_me.branch_id and kind = 'supplier'
     for update;
  if not found then
    raise exception 'المورد مش موجود';
  end if;
  v_owed := greatest(0, private.supplier_balance(p_supplier_id));
  if v_amount > v_owed then
    raise exception 'أكتر من اللي ليه (%)', private.fmt(v_owed);
  end if;
  return private.add_movement(v_me, v_shift, 'supplier_payment', 'دفعة لـ ' || v_name || coalesce(' — ' || v_note, ''),
    p_cash => case when p_via = 'cash' then -v_amount else 0 end,
    p_wallet => case when p_via = 'wallet' then -v_amount else 0 end,
    p_bank => case when p_via = 'bank' then -v_amount else 0 end,
    p_contact_id => p_supplier_id);
end $$;

-- A month's salary (p_month: yyyy-mm), less the advances not deducted yet. The owner only. Returns the payroll entry.
create function public.pay_salary(p_employee_id uuid, p_month text, p_via text default 'cash') returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff := private.me();
  v_shift uuid;
  v_employee public.staff;
  v_advances numeric;
  v_entry public.payroll;
begin
  perform private.require_owner(v_me);
  v_shift := private.work_shift(v_me);
  if coalesce(p_via, '') not in ('cash', 'wallet', 'bank') then
    raise exception 'اختار المرتب هيتصرف منين';
  end if;
  if coalesce(p_month, '') !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'الشهر غلط';
  end if;
  select * into v_employee from public.staff where id = p_employee_id and branch_id = v_me.branch_id for update;
  if not found then
    raise exception 'الموظف مش موجود';
  end if;
  if exists (select 1 from public.payroll where employee_id = v_employee.id and month = p_month) then
    raise exception 'مرتب % لشهر % اتصرف قبل كده', v_employee.name, p_month;
  end if;
  v_advances := least(v_employee.salary, private.outstanding_advances(v_employee.id));
  insert into public.payroll (employee_id, month, salary, advances, net, via)
  values (v_employee.id, p_month, v_employee.salary, v_advances, v_employee.salary - v_advances, p_via)
  returning * into v_entry;
  perform private.add_movement(v_me, v_shift, 'salary_payment',
    'مرتب ' || v_employee.name || ' — ' || p_month
      || case when v_advances > 0 then ' (اتخصم سُلف ' || private.fmt(v_advances) || ')' else '' end,
    p_cash => case when p_via = 'cash' then -v_entry.net else 0 end,
    p_wallet => case when p_via = 'wallet' then -v_entry.net else 0 end,
    p_bank => case when p_via = 'bank' then -v_entry.net else 0 end,
    p_target_employee_id => v_employee.id);
  return to_jsonb(v_entry);
end $$;
