-- Moga ERP — server operations, part 5: who can call them.
--
-- Signed-in staff can call the operations; each one checks the rest itself (the owner-only ones, the open
-- shift, the employee's lending limit…). The anonymous key can't call any of them.

do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname = any (array[
         'complete_sale', 'refund_preview', 'return_order', 'open_shift', 'close_shift',
         'record_expense', 'record_employee_advance', 'record_owner_movement', 'record_service_operation',
         'record_agent_load', 'record_agent_payment',
         'receive_loan', 'repay_loan', 'settle_loan', 'lend_money', 'collect_lent', 'settle_lent',
         'collect_credit', 'pay_installment', 'pay_supplier', 'pay_salary',
         'add_supplier', 'add_product', 'receive_delivery', 'buy_used_phone', 'reprice_product', 'reprice_category',
         'update_settings', 'set_services', 'add_staff', 'update_staff', 'delete_staff', 'initialize_shop'
       ])
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
