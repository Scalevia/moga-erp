-- Moga ERP — server operations, part 1: shared helpers.
--
-- Every change in the shop goes through a function in `public`, called from the app as an RPC. Each one
-- checks who is asking, does the whole operation in one transaction (all of it or nothing), and records
-- every amount of money that moves as a cash_movements row. The helpers below live in `private`, which the
-- API doesn't expose. Error messages are in Arabic: the app shows them as they are.

-- Functions the postgres role creates from now on can't be called by everyone by default; each operation
-- is granted to signed-in staff explicitly (see the last operations migration).
alter default privileges for role postgres revoke execute on functions from public;

-- ---------------------------------------------------------------- who is asking

-- The signed-in staff member, or an error.
create function private.me() returns public.staff
language plpgsql stable set search_path = ''
as $$
declare
  v public.staff;
begin
  select * into v from public.staff where auth_user_id = (select auth.uid()) and active;
  if not found then
    raise exception 'لازم تسجّل دخول الأول' using errcode = '42501';
  end if;
  return v;
end $$;

create function private.require_owner(p_me public.staff) returns void
language plpgsql stable set search_path = ''
as $$
begin
  if p_me.role <> 'admin' then
    raise exception 'دي للمالك بس' using errcode = '42501';
  end if;
end $$;

-- The open shift an operation is recorded in, or null. Only the employee working it, or the owner, can
-- record in an open shift. Employees can't record anything before a shift is open (except, with
-- p_employee_needs_shift false, an agent's load before opening); the owner can work without one, as long
-- as no cash goes in or out of the drawer (see add_movement). The row is share-locked, so the shift can't
-- close in the middle of an operation.
create function private.work_shift(p_me public.staff, p_employee_needs_shift boolean default true) returns uuid
language plpgsql set search_path = ''
as $$
declare
  v_id uuid;
  v_holder uuid;
begin
  select id, employee_id into v_id, v_holder
    from public.shifts
   where branch_id = p_me.branch_id and closed_at is null
     for share;
  if v_id is not null then
    if v_holder <> p_me.id and p_me.role <> 'admin' then
      raise exception 'فيه وردية مفتوحة باسم % — لازم تتقفل الأول', (select name from public.staff where id = v_holder)
        using errcode = '42501';
    end if;
    return v_id;
  end if;
  if p_me.role <> 'admin' and p_employee_needs_shift then
    raise exception 'افتح الوردية الأول';
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------- small helpers

-- An amount of money typed in the app: more than zero, in piasters.
create function private.amount(p numeric) returns numeric
language plpgsql immutable set search_path = ''
as $$
begin
  if p is null or round(p, 2) <= 0 then
    raise exception 'المبلغ لازم يكون أكبر من صفر';
  end if;
  return round(p, 2);
end $$;

-- Numbers in descriptions, as the app writes them: 1,500 or 12.5.
create function private.fmt(p numeric) returns text
language sql immutable set search_path = ''
as $$
  select case when p = trunc(p) then to_char(p, 'FM999,999,999,990') else to_char(p, 'FM999,999,999,990.99') end
$$;

create function private.balance_label(p_id text) returns text
language sql immutable set search_path = ''
as $$
  select case p_id
    when 'fawry_airtime' then 'فوري — شحن (Air time)'
    when 'fawry_general' then 'فوري — عام'
    when 'momkn' then 'ممكن'
  end
$$;

create function private.machine_label(p_id text) returns text
language sql immutable set search_path = ''
as $$
  select case p_id when 'fawry' then 'فوري' when 'momkn' then 'ممكن' end
$$;

-- The company (agent account) a machine balance belongs to.
create function private.balance_company(p_id text) returns text
language sql immutable set search_path = ''
as $$
  select case p_id when 'fawry_airtime' then 'fawry' when 'fawry_general' then 'fawry' when 'momkn' then 'momkn' end
$$;

create function private.ledger_label(p_kind text) returns text
language sql immutable set search_path = ''
as $$
  select case p_kind
    when 'owner_contribution' then 'إيداع من المالك'
    when 'owner_drawing' then 'مسحوبات المالك'
    when 'savings_payment' then 'دفع قسط جمعية'
    when 'savings_collection' then 'قبض جمعية'
    when 'asset_purchase' then 'شراء أصل'
    when 'vf_deposit' then 'إيداع فودافون كاش'
    when 'vf_withdrawal' then 'سحب فودافون كاش'
    when 'wallet_liquidation' then 'تسييل محفظة'
    when 'topup_sale' then 'شحن / دفع فواتير'
  end
$$;

-- ---------------------------------------------------------------- recording

-- One amount of money moving: its effect on the drawer (cash), the wallet, the bank, a machine balance
-- (topup) and an agent's account (rep), signed + in / − out. Cash in or out of the drawer needs an open
-- shift, because the drawer is counted per shift.
create function private.add_movement(
  p_me public.staff,
  p_shift uuid,
  p_kind text,
  p_description text,
  p_cash numeric default 0,
  p_wallet numeric default 0,
  p_bank numeric default 0,
  p_topup numeric default 0,
  p_commission numeric default 0,
  p_machine_id text default null,
  p_balance_id text default null,
  p_rep numeric default null,
  p_target_employee_id uuid default null,
  p_contact_id uuid default null,
  p_plan_id uuid default null,
  p_order_id uuid default null,
  p_purchase_id uuid default null,
  p_category text default null
) returns uuid
language plpgsql set search_path = ''
as $$
declare
  v_id uuid;
begin
  if coalesce(p_cash, 0) <> 0 and p_shift is null then
    raise exception 'الكاش من الدرج محتاج وردية مفتوحة';
  end if;
  insert into public.cash_movements (
    branch_id, shift_id, employee_id, kind, cash, wallet, bank, topup, commission, machine_id, balance_id, rep,
    target_employee_id, contact_id, plan_id, order_id, purchase_id, category, description
  ) values (
    p_me.branch_id, p_shift, p_me.id, p_kind, coalesce(p_cash, 0), coalesce(p_wallet, 0), coalesce(p_bank, 0),
    coalesce(p_topup, 0), coalesce(p_commission, 0), p_machine_id, p_balance_id, p_rep,
    p_target_employee_id, p_contact_id, p_plan_id, p_order_id, p_purchase_id, p_category, p_description
  )
  returning id into v_id;
  return v_id;
end $$;

-- The same phone is the same person (per kind): a second loan joins the first one's statement. With no
-- phone, it's a new contact. An existing contact keeps their name, unless it was only their number (a
-- sale where just the phone was taken, p_name_optional); a missing national ID is filled in.
create function private.upsert_contact(
  p_branch text, p_kind text, p_name text, p_phone text, p_national_id text default null, p_name_optional boolean default false
) returns uuid
language plpgsql set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_nid text := nullif(btrim(coalesce(p_national_id, '')), '');
  v_id uuid;
begin
  if v_name = '' and p_name_optional and v_phone <> '' then
    v_name := v_phone;
  end if;
  if v_name = '' then
    raise exception 'الاسم مطلوب';
  end if;
  if v_nid is not null and v_nid !~ '^\d{14}$' then
    raise exception 'الرقم القومي لازم يكون 14 رقم';
  end if;
  if v_phone = '' then
    insert into public.contacts (branch_id, kind, name, phone, national_id)
    values (p_branch, p_kind, v_name, '', v_nid)
    returning id into v_id;
  else
    insert into public.contacts as c (branch_id, kind, name, phone, national_id)
    values (p_branch, p_kind, v_name, v_phone, v_nid)
    on conflict (branch_id, kind, phone) where phone <> ''
    do update set national_id = coalesce(c.national_id, excluded.national_id),
                  name = case when c.name = c.phone and excluded.name <> excluded.phone then excluded.name else c.name end
    returning id into v_id;
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------- balances

-- Sales payments count whatever happened to the sale later: a return is its own refund movement.

create function private.wallet_balance(p_branch text) returns numeric
language sql stable set search_path = ''
as $$
  select coalesce((select wallet from public.opening_balances where branch_id = p_branch), 0)
    + coalesce((select sum(p.amount) from public.order_payments p join public.orders o on o.id = p.order_id
                 where o.branch_id = p_branch and p.method = 'vodafone_cash'), 0)
    + coalesce((select sum(m.wallet) from public.cash_movements m where m.branch_id = p_branch), 0)
$$;

-- The bank account: InstaPay and card (فيزا) payments for sales land here.
create function private.bank_balance(p_branch text) returns numeric
language sql stable set search_path = ''
as $$
  select coalesce((select bank from public.opening_balances where branch_id = p_branch), 0)
    + coalesce((select sum(p.amount) from public.order_payments p join public.orders o on o.id = p.order_id
                 where o.branch_id = p_branch and p.method in ('instapay', 'card')), 0)
    + coalesce((select sum(m.bank) from public.cash_movements m where m.branch_id = p_branch), 0)
$$;

create function private.machine_balance(p_branch text, p_balance text) returns numeric
language sql stable set search_path = ''
as $$
  select coalesce((select (machines ->> p_balance)::numeric from public.opening_balances where branch_id = p_branch), 0)
    + coalesce((select sum(m.topup) from public.cash_movements m where m.branch_id = p_branch and m.balance_id = p_balance), 0)
$$;

create function private.machine_balances(p_branch text) returns jsonb
language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'fawry_airtime', private.machine_balance(p_branch, 'fawry_airtime'),
    'fawry_general', private.machine_balance(p_branch, 'fawry_general'),
    'momkn', private.machine_balance(p_branch, 'momkn')
  )
$$;

-- An agent's account: > 0 the agent owes the shop balance, < 0 the shop owes the agent.
create function private.rep_balance(p_branch text, p_machine text) returns numeric
language sql stable set search_path = ''
as $$
  select coalesce((select (reps ->> p_machine)::numeric from public.opening_balances where branch_id = p_branch), 0)
    + coalesce((select sum(m.rep) from public.cash_movements m where m.branch_id = p_branch and m.machine_id = p_machine), 0)
$$;

-- What should be in the drawer: the counted float, cash taken for sales, and every cash movement in the shift.
create function private.expected_cash(p_shift uuid) returns numeric
language sql stable set search_path = ''
as $$
  select s.opening_float
    + coalesce((select sum(p.amount) from public.order_payments p join public.orders o on o.id = p.order_id
                 where o.shift_id = s.id and p.method = 'cash'), 0)
    + coalesce((select sum(m.cash) from public.cash_movements m where m.shift_id = s.id), 0)
  from public.shifts s
  where s.id = p_shift
$$;

-- A customer's account (آجل): what they left unpaid on their sales, less what they paid off since.
create function private.credit_balance(p_customer uuid) returns numeric
language sql stable set search_path = ''
as $$
  select coalesce((select sum(p.amount) from public.order_payments p join public.orders o on o.id = p.order_id
                    where o.customer_id = p_customer and o.status = 'completed' and p.method = 'credit'), 0)
    - coalesce((select sum(m.cash + m.wallet + m.bank) from public.cash_movements m
                 where m.kind = 'credit_collection' and m.contact_id = p_customer), 0)
$$;

-- What the shop owes a supplier: the balance from before the system, plus deliveries, less payments.
create function private.supplier_balance(p_supplier uuid) returns numeric
language sql stable set search_path = ''
as $$
  select c.opening_balance
    + coalesce((select sum(i.total) from public.purchase_invoices i where i.supplier_id = c.id), 0)
    + coalesce((select sum(m.cash + m.wallet + m.bank) from public.cash_movements m
                 where m.kind = 'supplier_payment' and m.contact_id = c.id), 0)
  from public.contacts c
  where c.id = p_supplier
$$;

-- Advances given to an employee and not yet deducted from a salary (advances are money out, so negative).
create function private.outstanding_advances(p_employee uuid) returns numeric
language sql stable set search_path = ''
as $$
  select greatest(0,
    - coalesce((select sum(m.cash + m.wallet) from public.cash_movements m
                 where m.kind = 'employee_advance' and m.target_employee_id = p_employee), 0)
    - coalesce((select sum(p.advances) from public.payroll p where p.employee_id = p_employee), 0))
$$;

-- ---------------------------------------------------------------- shift counts

-- A count of the wallet and the machine balances: {wallet, machines: {fawry_airtime, fawry_general, momkn}}.
create function private.parse_count(p jsonb) returns jsonb
language plpgsql immutable set search_path = ''
as $$
declare
  v_wallet numeric := round((p ->> 'wallet')::numeric, 2);
  v_machines jsonb := '{}';
  v_id text;
  v_x numeric;
begin
  if v_wallet is null or v_wallet < 0 then
    raise exception 'عدّ فودافون كاش ناقص';
  end if;
  foreach v_id in array array['fawry_airtime', 'fawry_general', 'momkn'] loop
    v_x := round((p -> 'machines' ->> v_id)::numeric, 2);
    if v_x is null or v_x < 0 then
      raise exception 'عدّ رصيد % ناقص', private.balance_label(v_id);
    end if;
    v_machines := v_machines || jsonb_build_object(v_id, v_x);
  end loop;
  return jsonb_build_object('wallet', v_wallet, 'machines', v_machines);
end $$;

-- A count that differs from the system sets the wallet and machine balances to what was counted, so the
-- difference is taken once (in the net profit, from the shift's counts) and not again at the next count.
-- (Cash needs no adjustment: each shift's drawer starts from its counted float.)
create function private.adjust_to_count(p_me public.staff, p_shift uuid, p_count jsonb, p_expected jsonb, p_when text)
returns void
language plpgsql set search_path = ''
as $$
declare
  v_diff numeric;
  v_id text;
begin
  v_diff := (p_count ->> 'wallet')::numeric - (p_expected ->> 'wallet')::numeric;
  if v_diff <> 0 then
    perform private.add_movement(p_me, p_shift, 'count_adjustment', 'فرق عدّ فودافون كاش ' || p_when, p_wallet => v_diff);
  end if;
  foreach v_id in array array['fawry_airtime', 'fawry_general', 'momkn'] loop
    v_diff := (p_count -> 'machines' ->> v_id)::numeric - (p_expected -> 'machines' ->> v_id)::numeric;
    if v_diff <> 0 then
      perform private.add_movement(p_me, p_shift, 'count_adjustment', 'فرق عدّ ' || private.balance_label(v_id) || ' ' || p_when,
        p_topup => v_diff, p_balance_id => v_id);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- installments

-- Monthly dues on the same day of the month as `p_start`, the first one `p_first_month` months after it
-- (0 = on `p_start` itself). In a shorter month the due falls on its last day: a sale on Jan 31 is due
-- Feb 28, Mar 31, Apr 30… Equal installments, or `p_each` when the agreed monthly amount is known; the last
-- one takes what's left either way.
create function private.add_schedule(
  p_plan uuid, p_financed numeric, p_months integer, p_start date, p_each numeric default null, p_first_month integer default 1
) returns void
language plpgsql set search_path = ''
as $$
declare
  v_each numeric := coalesce(p_each, round(p_financed / p_months));
  v_last numeric := p_financed - v_each * (p_months - 1);
  v_month date;
  v_month_days integer;
begin
  if v_last < 0 then
    raise exception 'القسط الشهري أكبر من المبلغ';
  end if;
  for i in 0 .. p_months - 1 loop
    v_month := (date_trunc('month', p_start::timestamp) + make_interval(months => i + p_first_month))::date;
    v_month_days := extract(day from v_month + interval '1 month' - interval '1 day')::integer;
    insert into public.installment_dues (plan_id, n, due_date, amount)
    values (p_plan, i + 1, v_month + (least(extract(day from p_start)::integer, v_month_days) - 1),
            case when i = p_months - 1 then v_last else v_each end);
  end loop;
end $$;

-- ---------------------------------------------------------------- returns

-- What returning a whole order gives back, by where the money leaves from: each payment goes back the way
-- it came in (cash → drawer, Vodafone Cash → wallet, InstaPay/card → bank). For an installment sale it also
-- includes the installments already collected, and the markup profit counted on them, which the return
-- reverses. Bought partly on account: what the customer already paid off toward it comes back too (as cash).
-- `p_via` sends the whole amount back from one place instead (e.g. paid by card, refunded in cash).
create function private.refund_for(p_order public.orders, p_via text default null) returns jsonb
language plpgsql stable set search_path = ''
as $$
declare
  v_cash numeric;
  v_wallet numeric;
  v_bank numeric;
  v_on_account numeric;
  v_from_account numeric := 0;
  v_plan public.installment_plans;
  v_installments numeric := 0;
  v_traced numeric := 0;
  v_markup numeric := 0;
  v_untraced numeric;
  v_total numeric;
begin
  select coalesce(sum(amount) filter (where method = 'cash'), 0),
         coalesce(sum(amount) filter (where method = 'vodafone_cash'), 0),
         coalesce(sum(amount) filter (where method in ('instapay', 'card')), 0),
         coalesce(sum(amount) filter (where method = 'credit'), 0)
    into v_cash, v_wallet, v_bank, v_on_account
    from public.order_payments
   where order_id = p_order.id;
  -- ("installment" and "credit": nothing was received for them at the sale.)

  if v_on_account > 0 and p_order.customer_id is not null then
    v_from_account := least(v_on_account, greatest(0, v_on_account - private.credit_balance(p_order.customer_id)));
    v_cash := v_cash + v_from_account;
  end if;

  if p_order.installment_plan_id is not null then
    select * into v_plan from public.installment_plans where id = p_order.installment_plan_id and cancelled_at is null;
    if found then
      select coalesce(sum(paid), 0) into v_installments from public.installment_dues where plan_id = v_plan.id;
      select v_cash + coalesce(sum(cash), 0), v_wallet + coalesce(sum(wallet), 0), v_bank + coalesce(sum(bank), 0),
             coalesce(sum(cash + wallet + bank), 0), coalesce(sum(commission), 0)
        into v_cash, v_wallet, v_bank, v_traced, v_markup
        from public.cash_movements
       where kind = 'installment_collection' and plan_id = v_plan.id;
      -- Collections not linked to their plan go back as cash, with the same markup share.
      v_untraced := greatest(0, v_installments - v_traced);
      v_cash := v_cash + v_untraced;
      v_markup := v_markup + round(v_untraced * v_plan.markup_percent / (100 + v_plan.markup_percent));
    end if;
  end if;

  v_total := v_cash + v_wallet + v_bank;
  if p_via is not null then
    v_cash := case when p_via = 'cash' then v_total else 0 end;
    v_wallet := case when p_via = 'wallet' then v_total else 0 end;
    v_bank := case when p_via = 'bank' then v_total else 0 end;
  end if;
  -- `from_account` is part of the amounts above, leaving from `from_account_via`.
  return jsonb_build_object(
    'cash', v_cash, 'wallet', v_wallet, 'bank', v_bank, 'total', v_total,
    'installments', v_installments, 'markup', v_markup, 'plan_id', v_plan.id,
    'on_account', v_on_account, 'from_account', v_from_account, 'from_account_via', coalesce(p_via, 'cash')
  );
end $$;

-- None of the helpers is called directly: the operations run them as their owner.
revoke execute on all functions in schema private from public;
grant execute on function private.current_staff_id(), private.is_staff(), private.is_owner() to authenticated;
