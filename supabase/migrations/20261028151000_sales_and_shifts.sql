-- Moga ERP — server operations, part 2: selling, returns, and opening and closing a shift.

-- Invoice numbers are given by the operations (complete_sale, receive_delivery), one after the other with
-- no gaps: a sale or a delivery that fails doesn't use a number up, as the columns' sequences would. The
-- sequences stay in place, unused.

-- ---------------------------------------------------------------- selling

-- One sale at the counter: what was sold, how it was paid, and who bought it.
-- Returns {id, number, total, extra, plan_id}.
--
-- p_items, each with the price the customer pays (unit_price):
--   {imei}                    a phone, which must be on the shelf
--   {product_id, qty}         a quantity item, never sold below what's in stock
--   {category: 'service', service_id (null = أخرى), name, note, unit_cost}
-- The cost and the shelf price of stock come from the stock records, not from the app.
-- p_payments: [{method, amount}] — cash, vodafone_cash, instapay, card; 'credit' is what's left on the
--   customer's account (آجل); 'installment' is the part the shop finances. Paying more than the total is
--   allowed: the extra is part of the sale and its profit.
-- p_customer: {name, phone, national_id} — optional, except for selling a phone and for credit (name and
--   phone), and for installments (with the national ID).
-- p_installment: {markup_percent, months, guarantor: {name, phone, national_id}} — an installment sale;
--   whatever was paid now is the down payment.
create function public.complete_sale(p_items jsonb, p_payments jsonb, p_customer jsonb default null, p_installment jsonb default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff;
  v_shift uuid;
  v_customer uuid;
  v_named boolean;
  v_order uuid;
  v_number bigint;
  v_item jsonb;
  v_line integer := 0;
  v_imei text;
  v_unit record;
  v_product public.products;
  v_service uuid;
  v_name text;
  v_note text;
  v_qty integer;
  v_price numeric;
  v_cost numeric;
  v_total numeric := 0;
  v_has_phone boolean := false;
  v_pay jsonb;
  v_method text;
  v_amount numeric;
  v_paid numeric := 0;
  v_credit numeric := 0;
  v_financed numeric := 0;
  v_extra numeric;
  v_markup numeric;
  v_months integer;
  v_guarantor uuid;
  v_plan uuid;
begin
  v_me := private.me();
  v_shift := private.work_shift(v_me);
  if v_shift is null then
    raise exception 'افتح الوردية الأول';
  end if;
  p_customer := nullif(p_customer, 'null'::jsonb);
  p_installment := nullif(p_installment, 'null'::jsonb);
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'الفاتورة فاضية';
  end if;
  if jsonb_typeof(p_payments) is distinct from 'array' then
    raise exception 'طريقة الدفع ناقصة';
  end if;

  -- The customer is optional on a plain sale; just a phone number is enough to keep it.
  if btrim(coalesce(p_customer ->> 'phone', '')) <> '' then
    v_customer := private.upsert_contact(v_me.branch_id, 'customer', p_customer ->> 'name', p_customer ->> 'phone',
      p_customer ->> 'national_id', p_name_optional => true);
  end if;
  v_named := v_customer is not null and btrim(coalesce(p_customer ->> 'name', '')) <> '';

  perform pg_advisory_xact_lock(hashtextextended('order_number', 0));
  select coalesce(max(number), 0) + 1 into v_number from public.orders;
  insert into public.orders (number, branch_id, channel, employee_id, shift_id, customer_id)
  values (v_number, v_me.branch_id, 'pos', v_me.id, v_shift, v_customer)
  returning id into v_order;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_line := v_line + 1;
    v_price := round((v_item ->> 'unit_price')::numeric, 2);
    if v_price is null or v_price < 0 then
      raise exception 'السعر غلط في السطر %', v_line;
    end if;
    v_imei := nullif(btrim(coalesce(v_item ->> 'imei', '')), '');

    if v_imei is not null then
      select u.status, u.cost, u.branch_id, coalesce(u.retail_price, p.retail_price) as list_price,
             p.id as product_id, p.name, p.category
        into v_unit
        from public.phone_units u
        join public.products p on p.id = u.product_id
       where u.imei = v_imei
         for update of u;
      if not found or v_unit.branch_id <> v_me.branch_id then
        raise exception 'الموبايل % مش متسجّل في المخزن', v_imei;
      end if;
      if v_unit.status <> 'in_stock' then
        raise exception 'الموبايل % مش في المخزن', v_imei;
      end if;
      insert into public.order_items (order_id, line_no, category, product_id, name, imei, qty, list_price, unit_price, unit_cost)
      values (v_order, v_line, v_unit.category, v_unit.product_id, v_unit.name, v_imei, 1, v_unit.list_price, v_price, v_unit.cost);
      update public.phone_units set status = 'sold', sold_order_id = v_order where imei = v_imei;
      v_total := v_total + v_price;
      v_has_phone := true;

    elsif v_item ->> 'category' = 'service' then
      -- A service the shop performs: no stock; the cashier says what it cost the shop (0 if nothing).
      v_cost := round((v_item ->> 'unit_cost')::numeric, 2);
      if v_cost is null or v_cost < 0 then
        raise exception 'تكلفة الخدمة غلط في السطر %', v_line;
      end if;
      if v_price <= 0 then
        raise exception 'سعر الخدمة غلط في السطر %', v_line;
      end if;
      v_service := nullif(v_item ->> 'service_id', '')::uuid;
      if v_service is not null and not exists (select 1 from public.services where id = v_service and branch_id = v_me.branch_id) then
        raise exception 'الخدمة في السطر % مش موجودة', v_line;
      end if;
      v_name := btrim(coalesce(v_item ->> 'name', ''));
      v_note := nullif(btrim(coalesce(v_item ->> 'note', '')), '');
      if v_name = '' then
        raise exception 'اسم الخدمة ناقص في السطر %', v_line;
      end if;
      if v_service is null and v_note is null then
        raise exception 'اكتب اللي اتعمل في الخدمة (السطر %)', v_line;
      end if;
      insert into public.order_items (order_id, line_no, category, service_id, name, qty, note, list_price, unit_price, unit_cost)
      values (v_order, v_line, 'service', v_service, v_name, 1, v_note, v_price, v_price, v_cost);
      v_total := v_total + v_price;

    else
      v_qty := (v_item ->> 'qty')::integer;
      if v_qty is null or v_qty <= 0 then
        raise exception 'الكمية غلط في السطر %', v_line;
      end if;
      select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid;
      if not found then
        raise exception 'المنتج في السطر % مش موجود', v_line;
      end if;
      if v_product.tracking <> 'quantity' then
        raise exception '% بيتباع بالـ IMEI', v_product.name;
      end if;
      -- No selling more than there is: a piece sold first has to be received in stock.
      update public.product_stock set quantity = quantity - v_qty
       where branch_id = v_me.branch_id and product_id = v_product.id and quantity >= v_qty
      returning avg_cost into v_cost;
      if not found then
        raise exception 'الكمية اللي في المخزن من % أقل من كده — سجّلها في استلام بضاعة الأول', v_product.name;
      end if;
      insert into public.order_items (order_id, line_no, category, product_id, name, qty, list_price, unit_price, unit_cost)
      values (v_order, v_line, v_product.category, v_product.id, v_product.name, v_qty, v_product.retail_price, v_price, v_cost);
      v_total := v_total + v_qty * v_price;
    end if;
  end loop;
  if v_has_phone and not v_named then
    raise exception 'اكتب اسم وتليفون الزبون قبل بيع الموبايل';
  end if;

  for v_pay in select value from jsonb_array_elements(p_payments) loop
    v_method := v_pay ->> 'method';
    v_amount := round((v_pay ->> 'amount')::numeric, 2);
    if coalesce(v_method, '') not in ('cash', 'vodafone_cash', 'instapay', 'card', 'installment', 'credit') then
      raise exception 'طريقة دفع غلط';
    end if;
    if v_amount is null or v_amount <= 0 then
      raise exception 'مبلغ الدفع لازم يكون أكبر من صفر';
    end if;
    insert into public.order_payments (order_id, method, amount) values (v_order, v_method, v_amount);
    v_paid := v_paid + v_amount;
    if v_method = 'credit' then v_credit := v_credit + v_amount; end if;
    if v_method = 'installment' then v_financed := v_financed + v_amount; end if;
  end loop;

  if v_paid < v_total then
    raise exception 'المدفوع أقل من الإجمالي';
  end if;
  -- Paid more than the price and left it: it's part of the sale (and its profit).
  v_extra := v_paid - v_total;
  if v_extra > 0 and (v_credit > 0 or v_financed > 0) then
    raise exception 'الفاتورة فيها زيادة وباقي في نفس الوقت';
  end if;
  if v_credit > 0 and not v_named then
    raise exception 'الباقي على الحساب محتاج اسم الزبون وتليفونه';
  end if;
  if v_extra > 0 then
    update public.orders set extra = v_extra where id = v_order;
  end if;

  if (p_installment is not null) <> (v_financed > 0) then
    raise exception 'بيانات التقسيط ناقصة';
  end if;
  if p_installment is not null then
    if v_credit > 0 then
      raise exception 'التقسيط مينفعش يبقى معاه باقي على الحساب';
    end if;
    if not v_has_phone then
      raise exception 'التقسيط للموبايلات بس';
    end if;
    if not v_named or (select national_id from public.contacts where id = v_customer) is null then
      raise exception 'التقسيط محتاج اسم الزبون وتليفونه ورقمه القومي';
    end if;
    v_markup := round((p_installment ->> 'markup_percent')::numeric, 2);
    v_months := (p_installment ->> 'months')::integer;
    if v_markup is null or v_markup < 0 then
      raise exception 'نسبة الزيادة غلط';
    end if;
    if v_months is null or v_months <= 0 then
      raise exception 'عدد الشهور غلط';
    end if;
    if btrim(coalesce(p_installment -> 'guarantor' ->> 'phone', '')) <> '' then
      v_guarantor := private.upsert_contact(v_me.branch_id, 'guarantor', p_installment -> 'guarantor' ->> 'name',
        p_installment -> 'guarantor' ->> 'phone', p_installment -> 'guarantor' ->> 'national_id');
    end if;
    insert into public.installment_plans (branch_id, order_id, customer_id, guarantor_id, cash_price, down_payment, markup_percent, months)
    values (v_me.branch_id, v_order, v_customer, v_guarantor, v_total, v_total - v_financed, v_markup, v_months)
    returning id into v_plan;
    -- The financed part with its markup, in equal months starting a month from today (Cairo).
    perform private.add_schedule(v_plan, round(v_financed * (1 + v_markup / 100)), v_months, (now() at time zone 'Africa/Cairo')::date);
    update public.orders set installment_plan_id = v_plan where id = v_order;
  end if;

  return jsonb_build_object('id', v_order, 'number', v_number, 'total', v_total + v_extra, 'extra', v_extra, 'plan_id', v_plan);
end $$;

-- ---------------------------------------------------------------- returns

-- What returning an order would give back, and from where (shown before confirming the return).
create function public.refund_preview(p_order_id uuid, p_via text default null) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_me public.staff := private.me();
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id and branch_id = v_me.branch_id;
  if not found then
    raise exception 'الفاتورة مش موجودة';
  end if;
  return private.refund_for(v_order, p_via);
end $$;

-- Returning a whole order: the stock comes back, an installment plan is cancelled, and the money goes back
-- the way it was paid (or all of it via `p_via`: cash, wallet or bank). The return belongs to the sale's
-- own day: the sale simply stops counting. Returns what was given back (see refund_for).
create function public.return_order(p_order_id uuid, p_reason text, p_via text default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff;
  v_shift uuid;
  v_order public.orders;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_refund jsonb;
  v_bad text;
  v_via text;
  v_from numeric;
  v_cash numeric;
  v_wallet numeric;
  v_bank numeric;
  v_installments numeric;
  v_markup numeric;
begin
  v_me := private.me();
  v_shift := private.work_shift(v_me);
  if v_reason = '' then
    raise exception 'اكتب سبب المرتجع';
  end if;
  if p_via is not null and p_via not in ('cash', 'wallet', 'bank') then
    raise exception 'طريقة رد الفلوس غلط';
  end if;
  select * into v_order from public.orders where id = p_order_id and branch_id = v_me.branch_id for update;
  if not found then
    raise exception 'الفاتورة مش موجودة';
  end if;
  if v_order.status = 'returned' then
    raise exception 'الفاتورة دي اترجعت قبل كده';
  end if;

  -- A phone comes back only while it's still out under this sale (not bought back by the shop since).
  perform 1 from public.phone_units
   where imei in (select imei from public.order_items where order_id = v_order.id and imei is not null)
     for update;
  select string_agg(u.imei, '، ') into v_bad
    from public.order_items i
    join public.phone_units u on u.imei = i.imei
   where i.order_id = v_order.id and (u.status <> 'sold' or u.sold_order_id is distinct from v_order.id);
  if v_bad is not null then
    raise exception 'الموبايل % اتشرى تاني بعد الفاتورة دي — مينفعش يترجع عليها', v_bad;
  end if;

  v_refund := private.refund_for(v_order, p_via); -- before the status changes: the account still counts this sale

  update public.orders set status = 'returned', returned_at = now(), returned_by = v_me.id, return_reason = v_reason
   where id = v_order.id;
  update public.phone_units set status = 'in_stock', sold_order_id = null
   where imei in (select imei from public.order_items where order_id = v_order.id and imei is not null);
  insert into public.product_stock as s (branch_id, product_id, quantity)
  select v_order.branch_id, i.product_id, sum(i.qty)
    from public.order_items i
   where i.order_id = v_order.id and i.product_id is not null and i.imei is null
   group by i.product_id
  on conflict (branch_id, product_id) do update set quantity = s.quantity + excluded.quantity;
  -- An installment sale that comes back has nothing left to collect.
  if v_refund ->> 'plan_id' is not null then
    update public.installment_plans set cancelled_at = now() where id = (v_refund ->> 'plan_id')::uuid;
  end if;

  -- Everything the customer paid goes back the way it came in. The markup already counted as profit on
  -- collected installments is reversed; the sale's own profit drops out with the order's status. What they
  -- had paid off their account toward this sale is a reversed collection, so their account ends at zero
  -- for it rather than showing the shop owing them.
  v_via := v_refund ->> 'from_account_via';
  v_from := (v_refund ->> 'from_account')::numeric;
  v_cash := (v_refund ->> 'cash')::numeric - case when v_via = 'cash' then v_from else 0 end;
  v_wallet := (v_refund ->> 'wallet')::numeric - case when v_via = 'wallet' then v_from else 0 end;
  v_bank := (v_refund ->> 'bank')::numeric - case when v_via = 'bank' then v_from else 0 end;
  v_installments := (v_refund ->> 'installments')::numeric;
  v_markup := (v_refund ->> 'markup')::numeric;
  if v_from > 0 then
    perform private.add_movement(v_me, v_shift, 'credit_collection', 'رد اللي اتدفع من الحساب — مرتجع فاتورة #' || v_order.number,
      p_cash => case when v_via = 'cash' then -v_from else 0 end,
      p_wallet => case when v_via = 'wallet' then -v_from else 0 end,
      p_bank => case when v_via = 'bank' then -v_from else 0 end,
      p_contact_id => v_order.customer_id, p_order_id => v_order.id);
  end if;
  if v_cash + v_wallet + v_bank <> 0 or v_markup <> 0 then
    perform private.add_movement(v_me, v_shift, 'refund',
      'مرتجع فاتورة #' || v_order.number
        || case when v_installments > 0 then ' (منها أقساط اتدفعت ' || private.fmt(v_installments) || ')' else '' end
        || ' — ' || v_reason,
      p_cash => -v_cash, p_wallet => -v_wallet, p_bank => -v_bank, p_commission => -v_markup,
      p_plan_id => (v_refund ->> 'plan_id')::uuid, p_order_id => v_order.id);
  end if;
  return v_refund;
end $$;

-- ---------------------------------------------------------------- shifts

-- Opening a shift: the drawer, the wallet and the machine balances are counted. What should have been there
-- is worked out here: the cash the last shift closed with (it stays in the drawer between shifts) and the
-- system's wallet and machine balances, which include agent loads recorded this morning before opening.
-- p_count: {wallet, machines: {fawry_airtime, fawry_general, momkn}}. Returns the shift's id.
create function public.open_shift(p_float numeric, p_count jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff;
  v_count jsonb;
  v_float numeric := round(p_float, 2);
  v_holder text;
  v_last public.shifts;
  v_expected jsonb;
  v_shift uuid;
begin
  v_me := private.me();
  v_count := private.parse_count(p_count);
  if v_float is null or v_float < 0 then
    raise exception 'عدّ الدرج ناقص';
  end if;
  select st.name into v_holder
    from public.shifts s
    join public.staff st on st.id = s.employee_id
   where s.branch_id = v_me.branch_id and s.closed_at is null;
  if found then
    raise exception 'فيه وردية مفتوحة باسم %', v_holder;
  end if;

  select * into v_last from public.shifts
   where branch_id = v_me.branch_id and closed_at is not null
   order by closed_at desc
   limit 1;
  v_expected := jsonb_build_object(
    'cash', v_last.counted_cash, -- null before the first shift
    'wallet', private.wallet_balance(v_me.branch_id),
    'machines', private.machine_balances(v_me.branch_id)
  );
  begin
    insert into public.shifts (branch_id, employee_id, opening_float, opening_count, opening_expected, previous_employee_id)
    values (v_me.branch_id, v_me.id, v_float, v_count, v_expected, v_last.employee_id)
    returning id into v_shift;
  exception when unique_violation then
    raise exception 'فيه وردية اتفتحت دلوقتي — حدّث الصفحة';
  end;
  -- A different count sets the balances to what was counted; the difference shows in the shift's report.
  perform private.adjust_to_count(v_me, v_shift, v_count, v_expected, 'عند استلام الشيفت');
  return v_shift;
end $$;

-- Closing the shift: the drawer, the wallet and the machines are counted blind; what should have been
-- there is worked out here. The shift's holder or the owner can close it. Returns the closed shift.
create function public.close_shift(p_counted numeric, p_count jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff;
  v_count jsonb;
  v_counted numeric := round(p_counted, 2);
  v_shift public.shifts;
  v_expected_cash numeric;
  v_expected jsonb;
begin
  v_me := private.me();
  v_count := private.parse_count(p_count);
  if v_counted is null or v_counted < 0 then
    raise exception 'عدّ الدرج ناقص';
  end if;
  select * into v_shift from public.shifts where branch_id = v_me.branch_id and closed_at is null for update;
  if not found then
    raise exception 'مفيش وردية مفتوحة';
  end if;
  if v_shift.employee_id <> v_me.id and v_me.role <> 'admin' then
    raise exception 'الوردية دي مش بتاعتك' using errcode = '42501';
  end if;

  v_expected_cash := private.expected_cash(v_shift.id);
  v_expected := jsonb_build_object('wallet', private.wallet_balance(v_me.branch_id), 'machines', private.machine_balances(v_me.branch_id));
  -- while the shift is still open, so the adjustments are recorded in it
  perform private.adjust_to_count(v_me, v_shift.id, v_count, v_expected, 'عند تقفيل الشيفت');
  update public.shifts
     set closed_at = now(), counted_cash = v_counted, expected_cash = v_expected_cash,
         closing_count = v_count, closing_expected = v_expected
   where id = v_shift.id
  returning * into v_shift;
  return to_jsonb(v_shift);
end $$;
