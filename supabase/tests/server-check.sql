-- Moga ERP — a full run of every server operation, signed in as the owner and two employees, that leaves
-- nothing behind: it ends with an error on purpose, so the whole run is rolled back (the test accounts,
-- the shop, the sales, everything). It runs only on an empty shop, before the first-time setup.
-- `npm test` runs it on a local copy of the database; it can also be run whole on the real one.
-- The result is that error's message: "RESULT: n passed, 0 failed".
do $$
declare
  u_owner constant uuid := 'c0ffee00-0000-4000-8000-000000000001';
  u_emp constant uuid := 'c0ffee00-0000-4000-8000-000000000002';
  u_emp2 constant uuid := 'c0ffee00-0000-4000-8000-000000000003';
  u_stranger constant uuid := 'c0ffee00-0000-4000-8000-000000000004';
  s_owner uuid;
  s_emp uuid;
  s_emp2 uuid;
  s_temp uuid;
  passed integer := 0;
  failed text := '';
  r jsonb;
  num numeric;
  t text;
  p_iphone uuid;
  p_charger uuid;
  p_cable uuid;
  p_case uuid;
  p_used uuid;
  svc uuid;
  sup_setup uuid;
  sup_new uuid;
  lender_setup uuid;
  borrower uuid;
  cust_credit uuid;
  shift1 uuid;
  shift2 uuid;
  sale_charger jsonb;
  sale_extra jsonb;
  sale_credit jsonb;
  sale_card jsonb;
  sale_inst jsonb;
  plan uuid;
  loan_new uuid;
  lent uuid;
  drawer numeric := 30000; -- what the drawer should hold, worked out here independently
  v_wallet numeric;
  v_machines jsonb;
begin
  if exists (select 1 from public.staff) or exists (select 1 from public.products) then
    raise exception 'ABORT: this check runs only on an empty shop';
  end if;

  -- ---------------------------------------------------------------- people
  insert into auth.users (id, email) values
    (u_owner, 'check-owner@moga.test'), (u_emp, 'check-emp@moga.test'),
    (u_emp2, 'check-emp2@moga.test'), (u_stranger, 'check-stranger@moga.test');
  insert into public.staff (auth_user_id, name, role, username) values (u_owner, 'مالك تجربة', 'admin', 'check_owner')
  returning id into s_owner;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', u_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  s_emp := public.add_staff('موظف تجربة', 'employee', 'check_emp', 5000);
  s_emp2 := public.add_staff('موظف تاني تجربة', 'employee', 'check_emp2', 4000);
  s_temp := public.add_staff('مؤقت تجربة', 'employee', 'check_temp');
  execute 'reset role';
  update public.staff set auth_user_id = u_emp where id = s_emp;
  update public.staff set auth_user_id = u_emp2 where id = s_emp2;

  -- ---------------------------------------------------------------- first-time setup (owner)
  perform set_config('request.jwt.claims', jsonb_build_object('sub', u_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := public.initialize_shop(jsonb_build_object(
    'cash', 30000, 'wallet', 5000, 'bank', 1000, 'savings', 0, 'fixed_assets', 0,
    'machines', jsonb_build_object('fawry_airtime', 2000, 'fawry_general', 1000, 'momkn', 500),
    'reps', jsonb_build_object('fawry', 0, 'momkn', -300),
    'products', jsonb_build_array(
      jsonb_build_object('name', 'آيفون تجربة', 'brand', 'Apple', 'category', 'new_phone', 'cost', 25000, 'retail', 30000,
                         'imeis', jsonb_build_array('990000000000001', '990000000000002')),
      jsonb_build_object('name', 'شاحن تجربة', 'category', 'accessory', 'cost', 100, 'retail', 150, 'qty', 10),
      jsonb_build_object('name', 'كابل تجربة', 'category', 'accessory', 'cost', 20, 'retail', 40, 'qty', 5)),
    'suppliers', jsonb_build_array(jsonb_build_object('name', 'مورد تجربة', 'phone', '01000000999', 'balance', 2000)),
    'lenders', jsonb_build_array(jsonb_build_object('name', 'مقرض تجربة', 'phone', '01100000999', 'remaining', 5000)),
    'installments', jsonb_build_array(jsonb_build_object('name', 'عميل قديم تجربة', 'phone', '01200000999',
      'remaining', 1500, 'monthly', 500, 'next_due', ((now() at time zone 'Africa/Cairo')::date + 10)::text))));
  if r = '{"products": 3, "phones": 2, "suppliers": 1, "loans": 1, "installment_plans": 1}'::jsonb then passed := passed + 1;
  else failed := failed || chr(10) || 'setup: ' || r::text; end if;
  begin
    perform public.initialize_shop('{"cash": 1}');
    failed := failed || chr(10) || 'setup twice: no error';
  exception when others then
    if sqlerrm like '%اتهيّأ قبل كده%' then passed := passed + 1; else failed := failed || chr(10) || 'setup twice: ' || sqlerrm; end if;
  end;
  select id into p_iphone from public.products where name = 'آيفون تجربة';
  select id into p_charger from public.products where name = 'شاحن تجربة';
  select id into p_cable from public.products where name = 'كابل تجربة';
  select id into svc from public.services where active order by sort limit 1;
  select id into sup_setup from public.contacts where kind = 'supplier' and phone = '01000000999';
  select id into lender_setup from public.contacts where kind = 'lender' and phone = '01100000999';
  -- The whole check runs in one transaction, so everything in it has the same time. The setup happens
  -- before the first shift in real life: move it an hour back, so "the last closed shift" stays clear.
  execute 'reset role';
  update public.shifts set opened_at = opened_at - interval '1 hour', closed_at = closed_at - interval '1 hour'
   where closed_at is not null;
  execute 'set local role authenticated';

  -- ---------------------------------------------------------------- the day starts (employee)
  perform set_config('request.jwt.claims', jsonb_build_object('sub', u_emp, 'role', 'authenticated')::text, true);
  begin
    perform public.record_expense('كهرباء', 10);
    failed := failed || chr(10) || 'expense before opening: no error';
  exception when others then
    if sqlerrm like '%افتح الوردية الأول%' then passed := passed + 1; else failed := failed || chr(10) || 'expense before opening: ' || sqlerrm; end if;
  end;
  num := public.record_agent_load('fawry', 'fawry_airtime', 1000);
  if num = 1010 then passed := passed + 1; else failed := failed || chr(10) || 'agent load bonus: ' || num; end if;
  shift1 := public.open_shift(30000, '{"wallet": 5000, "machines": {"fawry_airtime": 3010, "fawry_general": 1000, "momkn": 500}}');
  if not exists (select 1 from public.cash_movements where kind = 'count_adjustment') then passed := passed + 1;
  else failed := failed || chr(10) || 'opening with matching counts made adjustments'; end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', u_emp2, 'role', 'authenticated')::text, true);
  begin
    perform public.open_shift(1, '{"wallet": 1, "machines": {"fawry_airtime": 1, "fawry_general": 1, "momkn": 1}}');
    failed := failed || chr(10) || 'second shift: no error';
  exception when others then
    if sqlerrm like '%فيه وردية مفتوحة%' then passed := passed + 1; else failed := failed || chr(10) || 'second shift: ' || sqlerrm; end if;
  end;

  -- ---------------------------------------------------------------- selling (employee)
  perform set_config('request.jwt.claims', jsonb_build_object('sub', u_emp, 'role', 'authenticated')::text, true);
  sale_charger := public.complete_sale(jsonb_build_array(jsonb_build_object('product_id', p_charger, 'qty', 2, 'unit_price', 150)),
    '[{"method": "cash", "amount": 300}]');
  drawer := drawer + 300;
  sale_extra := public.complete_sale(jsonb_build_array(jsonb_build_object('product_id', p_cable, 'qty', 1, 'unit_price', 40)),
    '[{"method": "cash", "amount": 50}]');
  drawer := drawer + 50;
  if (sale_extra ->> 'extra')::numeric = 10 then passed := passed + 1; else failed := failed || chr(10) || 'extra: ' || sale_extra::text; end if;
  sale_credit := public.complete_sale(jsonb_build_array(jsonb_build_object('product_id', p_cable, 'qty', 1, 'unit_price', 40)),
    '[{"method": "cash", "amount": 20}, {"method": "credit", "amount": 20}]', '{"name": "زبون تجربة", "phone": "01500000999"}');
  drawer := drawer + 20;
  sale_card := public.complete_sale('[{"imei": "990000000000001", "unit_price": 30000}]', '[{"method": "card", "amount": 30000}]',
    '{"name": "مشتري تجربة", "phone": "01700000999"}');
  r := public.complete_sale(jsonb_build_array(jsonb_build_object('category', 'service', 'service_id', svc, 'name', 'خدمة تجربة',
    'unit_price', 50, 'unit_cost', 0)), '[{"method": "cash", "amount": 50}]');
  drawer := drawer + 50;
  sale_inst := public.complete_sale('[{"imei": "990000000000002", "unit_price": 30000}]',
    '[{"method": "cash", "amount": 6000}, {"method": "installment", "amount": 24000}]',
    '{"name": "عميل تقسيط تجربة", "phone": "01600000999", "national_id": "29001011234599"}', '{"markup_percent": 10, "months": 4}');
  drawer := drawer + 6000;
  plan := (sale_inst ->> 'plan_id')::uuid;
  if (sale_inst ->> 'number')::integer = 6 then passed := passed + 1; else failed := failed || chr(10) || 'invoice numbers: ' || sale_inst::text; end if;
  select string_agg(amount::text, ',' order by n) into t from public.installment_dues where plan_id = plan;
  if t = '6600.00,6600.00,6600.00,6600.00' then passed := passed + 1; else failed := failed || chr(10) || 'schedule: ' || coalesce(t, 'none'); end if;
  if (select unit_cost from public.order_items where order_id = (sale_charger ->> 'id')::uuid) = 100 then passed := passed + 1;
  else failed := failed || chr(10) || 'cost from stock'; end if;
  begin
    perform public.complete_sale(jsonb_build_array(jsonb_build_object('product_id', p_charger, 'qty', 100, 'unit_price', 150)),
      '[{"method": "cash", "amount": 15000}]');
    failed := failed || chr(10) || 'over stock: no error';
  exception when others then
    if sqlerrm like '%استلام بضاعة%' then passed := passed + 1; else failed := failed || chr(10) || 'over stock: ' || sqlerrm; end if;
  end;
  begin
    perform public.complete_sale('[{"imei": "990000000000001", "unit_price": 1}]', '[{"method": "cash", "amount": 1}]',
      '{"name": "س", "phone": "01700000998"}');
    failed := failed || chr(10) || 'phone sold twice: no error';
  exception when others then
    if sqlerrm like '%مش في المخزن%' then passed := passed + 1; else failed := failed || chr(10) || 'phone sold twice: ' || sqlerrm; end if;
  end;
  begin
    perform public.complete_sale(jsonb_build_array(jsonb_build_object('product_id', p_cable, 'qty', 1, 'unit_price', 40)),
      '[{"method": "credit", "amount": 40}]');
    failed := failed || chr(10) || 'credit without a customer: no error';
  exception when others then
    if sqlerrm like '%اسم الزبون%' then passed := passed + 1; else failed := failed || chr(10) || 'credit without a customer: ' || sqlerrm; end if;
  end;
  if (select quantity from public.product_stock where product_id = p_charger) = 8 then passed := passed + 1;
  else failed := failed || chr(10) || 'failed sales changed the stock'; end if;

  -- ---------------------------------------------------------------- money (employee)
  perform public.pay_installment(plan, 6600, 'cash');
  drawer := drawer + 6600;
  if (select commission from public.cash_movements where kind = 'installment_collection' and plan_id = plan) = 600 then passed := passed + 1;
  else failed := failed || chr(10) || 'installment markup'; end if;
  perform public.record_expense('كهرباء', 100);
  drawer := drawer - 100;
  perform public.record_employee_advance(s_emp2, 200);
  drawer := drawer - 200;
  perform public.record_service_operation('vf_deposit', 500, 5, null, '01099999999');
  drawer := drawer + 505;
  perform public.record_service_operation('topup_sale', 100, 3, 'fawry_general');
  drawer := drawer + 100;
  perform public.record_agent_payment('momkn', 300, 'cash');
  drawer := drawer - 300;
  begin
    perform public.record_agent_payment('momkn', 1, 'cash');
    failed := failed || chr(10) || 'agent overpaid: no error';
  exception when others then
    if sqlerrm like '%أكتر من اللي عليك للمندوب%' then passed := passed + 1; else failed := failed || chr(10) || 'agent overpaid: ' || sqlerrm; end if;
  end;
  loan_new := public.receive_loan('مقرض جديد تجربة', '01100000998', 1000);
  drawer := drawer + 1000;
  perform public.repay_loan(loan_new, 400);
  drawer := drawer - 400;
  perform public.settle_loan(lender_setup, 1000, 'repaid', 'cash');
  drawer := drawer - 1000;
  begin
    perform public.settle_loan(lender_setup, 100, 'forgiven');
    failed := failed || chr(10) || 'employee forgiving: no error';
  exception when others then
    if sqlerrm like '%للمالك بس%' then passed := passed + 1; else failed := failed || chr(10) || 'employee forgiving: ' || sqlerrm; end if;
  end;
  begin
    perform public.lend_money('جار تجربة', '01300000999', 1500, (now() at time zone 'Africa/Cairo')::date + 7);
    failed := failed || chr(10) || 'lending over the limit: no error';
  exception when others then
    if sqlerrm like '%محتاج المالك%' then passed := passed + 1; else failed := failed || chr(10) || 'lending over the limit: ' || sqlerrm; end if;
  end;
  lent := public.lend_money('جار تجربة', '01300000999', 500, (now() at time zone 'Africa/Cairo')::date + 7);
  drawer := drawer - 500;
  perform public.collect_lent(lent, 200);
  drawer := drawer + 200;
  select borrower_id into borrower from public.lent_out where id = lent;
  perform public.settle_lent(borrower, 300, 'repaid', 'cash');
  drawer := drawer + 300;
  if (select amount - repaid - forgiven from public.lent_out where id = lent) = 0 then passed := passed + 1;
  else failed := failed || chr(10) || 'lent settled'; end if;
  select customer_id into cust_credit from public.orders where id = (sale_credit ->> 'id')::uuid;
  perform public.collect_credit(cust_credit, 20, 'cash');
  drawer := drawer + 20;

  -- ---------------------------------------------------------------- stock (employee)
  sup_new := public.add_supplier('مورد جديد تجربة', '01000000998');
  p_case := public.add_product('جراب تجربة', '', 'accessory', 50);
  r := public.receive_delivery(sup_new, jsonb_build_array(
    jsonb_build_object('product_id', p_case, 'quantity', 5, 'unit_cost', 20),
    jsonb_build_object('product_id', p_charger, 'quantity', 5, 'unit_cost', 110)), 100, 'cash');
  drawer := drawer - 100;
  if (r ->> 'total')::numeric = 650 and (r ->> 'number')::integer = 1 then passed := passed + 1; else failed := failed || chr(10) || 'delivery: ' || r::text; end if;
  if (select quantity = 13 and avg_cost = 103.85 from public.product_stock where product_id = p_charger) then passed := passed + 1;
  else failed := failed || chr(10) || 'average cost after delivery'; end if;
  perform public.pay_supplier(sup_setup, 500, 'cash');
  drawer := drawer - 500;
  p_used := public.buy_used_phone('آيفون تجربة مستعمل', 'Apple', '990000000000001', 15000, 20000,
    '{"name": "مشتري تجربة", "phone": "01700000999", "national_id": "29801011234599"}',
    '{"batteryHealth": 90, "screen": "excellent", "body": "good", "hasBox": true, "hasCharger": false}');
  drawer := drawer - 15000;
  if (select status = 'in_stock' and condition = 'used' and (sale_card ->> 'id')::uuid = any (past_order_ids)
        from public.phone_units where imei = '990000000000001') then passed := passed + 1;
  else failed := failed || chr(10) || 'buy-back'; end if;
  begin
    perform public.receive_delivery(sup_new, jsonb_build_array(
      jsonb_build_object('product_id', p_used, 'imeis', jsonb_build_array('990000000000077'), 'unit_cost', 10000)));
    failed := failed || chr(10) || 'used phones by delivery: no error';
  exception when others then
    if sqlerrm like '%شراء مستعمل%' then passed := passed + 1; else failed := failed || chr(10) || 'used phones by delivery: ' || sqlerrm; end if;
  end;

  -- ---------------------------------------------------------------- returns (employee)
  r := public.refund_preview((sale_extra ->> 'id')::uuid);
  if (r ->> 'cash')::numeric = 50 then passed := passed + 1; else failed := failed || chr(10) || 'refund preview: ' || r::text; end if;
  r := public.return_order((sale_charger ->> 'id')::uuid, 'تجربة');
  drawer := drawer - 300;
  if (select quantity from public.product_stock where product_id = p_charger) = 15 then passed := passed + 1;
  else failed := failed || chr(10) || 'stock back after a return'; end if;
  r := public.return_order((sale_credit ->> 'id')::uuid, 'تجربة');
  drawer := drawer - 40;
  if (r ->> 'from_account')::numeric = 20 then passed := passed + 1; else failed := failed || chr(10) || 'return on account: ' || r::text; end if;
  r := public.return_order((sale_inst ->> 'id')::uuid, 'تجربة');
  drawer := drawer - 12600;
  if (r ->> 'cash')::numeric = 12600 and (r ->> 'markup')::numeric = 600 then passed := passed + 1;
  else failed := failed || chr(10) || 'installment return: ' || r::text; end if;
  begin
    perform public.return_order((sale_card ->> 'id')::uuid, 'تجربة');
    failed := failed || chr(10) || 'return of a bought-back phone: no error';
  exception when others then
    if sqlerrm like '%اتشرى تاني%' then passed := passed + 1; else failed := failed || chr(10) || 'return of a bought-back phone: ' || sqlerrm; end if;
  end;

  -- ---------------------------------------------------------------- closing (employee, wallet counted 10 short)
  perform set_config('request.jwt.claims', jsonb_build_object('sub', u_emp2, 'role', 'authenticated')::text, true);
  begin
    perform public.close_shift(1, '{"wallet": 1, "machines": {"fawry_airtime": 1, "fawry_general": 1, "momkn": 1}}');
    failed := failed || chr(10) || 'closing someone else''s shift: no error';
  exception when others then
    if sqlerrm like '%مش بتاعتك%' then passed := passed + 1; else failed := failed || chr(10) || 'closing someone else''s shift: ' || sqlerrm; end if;
  end;
  execute 'reset role';
  if private.expected_cash(shift1) = drawer then passed := passed + 1;
  else failed := failed || chr(10) || 'expected cash ' || private.expected_cash(shift1) || ' vs ' || drawer; end if;
  v_wallet := private.wallet_balance('main');
  v_machines := private.machine_balances('main');
  if v_wallet = 4500 then passed := passed + 1; else failed := failed || chr(10) || 'wallet: ' || v_wallet; end if;
  if v_machines = '{"fawry_airtime": 3010, "fawry_general": 903, "momkn": 500}'::jsonb then passed := passed + 1;
  else failed := failed || chr(10) || 'machines: ' || v_machines::text; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', u_emp, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := public.close_shift(drawer, jsonb_build_object('wallet', v_wallet - 10, 'machines', v_machines));
  if (r ->> 'expected_cash')::numeric = drawer and r ->> 'closed_at' is not null then passed := passed + 1;
  else failed := failed || chr(10) || 'close: ' || r::text; end if;
  if (select count(*) = 1 and sum(wallet) = -10 from public.cash_movements where kind = 'count_adjustment' and shift_id = shift1) then
    passed := passed + 1;
  else failed := failed || chr(10) || 'closing adjustment'; end if;

  -- ---------------------------------------------------------------- the owner, no shift open
  perform set_config('request.jwt.claims', jsonb_build_object('sub', u_owner, 'role', 'authenticated')::text, true);
  begin
    perform public.record_owner_movement('owner_drawing', 100);
    failed := failed || chr(10) || 'cash with no shift: no error';
  exception when others then
    if sqlerrm like '%محتاج وردية مفتوحة%' then passed := passed + 1; else failed := failed || chr(10) || 'cash with no shift: ' || sqlerrm; end if;
  end;
  r := public.pay_salary(s_emp2, '2026-10', 'wallet');
  if (r ->> 'advances')::numeric = 200 and (r ->> 'net')::numeric = 3800 then passed := passed + 1;
  else failed := failed || chr(10) || 'salary: ' || r::text; end if;
  begin
    perform public.pay_salary(s_emp2, '2026-10', 'wallet');
    failed := failed || chr(10) || 'salary twice: no error';
  exception when others then
    if sqlerrm like '%اتصرف قبل كده%' then passed := passed + 1; else failed := failed || chr(10) || 'salary twice: ' || sqlerrm; end if;
  end;
  perform public.reprice_product(p_iphone, 32000, 26000);
  if (select amount from public.revaluations where product_id = p_iphone) = 1000 then passed := passed + 1;
  else failed := failed || chr(10) || 'revaluation'; end if;
  num := public.reprice_category('accessory', 10);
  if num = 3 and (select retail_price from public.products where id = p_charger) = 165 then passed := passed + 1;
  else failed := failed || chr(10) || 'category reprice: ' || num; end if;
  perform public.update_settings(p_bonus_percent => '{"fawry_airtime": 2}');
  perform public.set_services(jsonb_build_array(jsonb_build_object('id', svc, 'name', 'خدمة أولى'), jsonb_build_object('name', 'خدمة جديدة')));
  if (select count(*) from public.services where active) = 2 then passed := passed + 1; else failed := failed || chr(10) || 'services'; end if;
  perform public.update_staff(s_emp, p_salary => 5500);
  perform public.delete_staff(s_temp);
  begin
    perform public.delete_staff(s_emp2);
    failed := failed || chr(10) || 'deleting staff with records: no error';
  exception when others then
    if sqlerrm like '%اوقفه بدل ما تمسحه%' then passed := passed + 1; else failed := failed || chr(10) || 'deleting staff with records: ' || sqlerrm; end if;
  end;
  begin
    perform public.update_staff(s_owner, p_role => 'employee');
    failed := failed || chr(10) || 'last owner demoted: no error';
  exception when others then
    if sqlerrm like '%لازم يفضل مالك%' then passed := passed + 1; else failed := failed || chr(10) || 'last owner demoted: ' || sqlerrm; end if;
  end;

  -- ---------------------------------------------------------------- the next shift (second employee), closed by the owner
  perform set_config('request.jwt.claims', jsonb_build_object('sub', u_emp2, 'role', 'authenticated')::text, true);
  num := public.record_agent_load('fawry', 'fawry_airtime', 1000);
  if num = 1020 then passed := passed + 1; else failed := failed || chr(10) || 'new bonus: ' || num; end if;
  v_machines := jsonb_set(v_machines, '{fawry_airtime}', to_jsonb(3010 + 1020));
  shift2 := public.open_shift(drawer, jsonb_build_object('wallet', v_wallet - 10 - 3800, 'machines', v_machines));
  if (select (opening_expected ->> 'cash')::numeric = drawer and (opening_expected ->> 'wallet')::numeric = v_wallet - 3810
             and previous_employee_id = s_emp from public.shifts where id = shift2)
     and not exists (select 1 from public.cash_movements where kind = 'count_adjustment' and shift_id = shift2) then
    passed := passed + 1;
  else failed := failed || chr(10) || 'handover'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', u_owner, 'role', 'authenticated')::text, true);
  r := public.close_shift(drawer, jsonb_build_object('wallet', v_wallet - 3810, 'machines', v_machines));
  if r ->> 'closed_at' is not null and (r ->> 'employee_id')::uuid = s_emp2 then passed := passed + 1;
  else failed := failed || chr(10) || 'owner closing: ' || r::text; end if;

  -- ---------------------------------------------------------------- who can't
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  begin
    perform public.record_expense('كهرباء', 1);
    failed := failed || chr(10) || 'anonymous: no error';
  exception when others then
    if sqlstate = '42501' then passed := passed + 1; else failed := failed || chr(10) || 'anonymous: ' || sqlerrm; end if;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', u_stranger, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.record_expense('كهرباء', 1);
    failed := failed || chr(10) || 'not staff: no error';
  exception when others then
    if sqlerrm like '%لازم تسجّل دخول الأول%' then passed := passed + 1; else failed := failed || chr(10) || 'not staff: ' || sqlerrm; end if;
  end;
  begin
    insert into public.cash_movements (kind, description) values ('expense', 'x');
    failed := failed || chr(10) || 'direct write: no error';
  exception when others then
    if sqlstate = '42501' then passed := passed + 1; else failed := failed || chr(10) || 'direct write: ' || sqlerrm; end if;
  end;
  execute 'reset role';

  raise exception 'RESULT: % passed, % failed%', passed, length(failed) - length(replace(failed, chr(10), '')), failed;
end $$;
