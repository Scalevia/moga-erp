-- Moga ERP — server operations, part 4: stock (receiving, used phones, products, prices) and the owner's
-- settings, staff and first-time setup.

-- ---------------------------------------------------------------- suppliers and products

create function public.add_supplier(p_name text, p_phone text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff := private.me();
  v_shift uuid := private.work_shift(v_me);
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_other text;
  v_id uuid;
begin
  if v_name = '' or v_phone = '' then
    raise exception 'اكتب اسم المورد وتليفونه';
  end if;
  select name into v_other from public.contacts where branch_id = v_me.branch_id and kind = 'supplier' and phone = v_phone;
  if found then
    raise exception 'التليفون ده لمورد موجود: %', v_other;
  end if;
  insert into public.contacts (branch_id, kind, name, phone) values (v_me.branch_id, 'supplier', v_name, v_phone)
  returning id into v_id;
  return v_id;
end $$;

-- A new product in the catalog. Phones (new and used) are tracked one by one by IMEI, the rest by count.
create function public.add_product(p_name text, p_brand text, p_category text, p_retail_price numeric, p_barcode text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff := private.me();
  v_shift uuid := private.work_shift(v_me);
  v_name text := btrim(coalesce(p_name, ''));
  v_barcode text := nullif(btrim(coalesce(p_barcode, '')), '');
  v_price numeric := private.amount(p_retail_price);
  v_other text;
  v_id uuid;
begin
  if v_name = '' then
    raise exception 'اكتب اسم المنتج';
  end if;
  if coalesce(p_category, '') not in ('new_phone', 'used_phone', 'feature_phone', 'accessory') then
    raise exception 'اختار النوع';
  end if;
  if exists (select 1 from public.products where lower(name) = lower(v_name)) then
    raise exception 'فيه منتج بنفس الاسم';
  end if;
  select name into v_other from public.products where barcode = v_barcode;
  if found then
    raise exception 'الباركود ده متسجّل لـ %', v_other;
  end if;
  insert into public.products (name, brand, category, tracking, barcode, retail_price)
  values (v_name, btrim(coalesce(p_brand, '')), p_category,
          case when p_category in ('new_phone', 'used_phone') then 'imei' else 'quantity' end, v_barcode, v_price)
  returning id into v_id;
  if p_category not in ('new_phone', 'used_phone') then
    insert into public.product_stock (branch_id, product_id) values (v_me.branch_id, v_id);
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------- receiving stock

-- A supplier's delivery, received as one invoice. Phones come by IMEI, the rest by count, each line at
-- its unit cost; quantity items take a new average cost. Whatever isn't paid now (p_paid, from p_via:
-- cash, wallet or bank) is owed to the supplier.
-- p_lines: [{product_id, imeis: [...]} | {product_id, quantity}], each with unit_cost.
-- Returns {id, number, total}.
create function public.receive_delivery(
  p_supplier_id uuid, p_lines jsonb, p_paid numeric default 0, p_via text default 'cash', p_supplier_ref text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff := private.me();
  v_shift uuid := private.work_shift(v_me);
  v_paid numeric := round(coalesce(p_paid, 0), 2);
  v_supplier text;
  v_invoice uuid;
  v_number bigint;
  v_line jsonb;
  v_product public.products;
  v_cost numeric;
  v_qty integer;
  v_imeis text[];
  v_bad text;
  v_total numeric := 0;
begin
  if coalesce(p_via, '') not in ('cash', 'wallet', 'bank') then
    raise exception 'اختار الفلوس طالعة منين';
  end if;
  if v_paid < 0 then
    raise exception 'المدفوع مينفعش يبقى بالسالب';
  end if;
  select name into v_supplier from public.contacts where id = p_supplier_id and branch_id = v_me.branch_id and kind = 'supplier';
  if not found then
    raise exception 'اختار المورد';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'الفاتورة فاضية';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('purchase_number', 0));
  select coalesce(max(number), 0) + 1 into v_number from public.purchase_invoices;
  insert into public.purchase_invoices (number, branch_id, supplier_id, supplier_ref, employee_id, total, paid, via)
  values (v_number, v_me.branch_id, p_supplier_id, nullif(btrim(coalesce(p_supplier_ref, '')), ''), v_me.id, 0, 0, p_via)
  returning id into v_invoice;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    select * into v_product from public.products where id = (v_line ->> 'product_id')::uuid;
    if not found then
      raise exception 'منتج مش موجود في الفاتورة';
    end if;
    v_cost := round((v_line ->> 'unit_cost')::numeric, 2);
    if v_cost is null or v_cost <= 0 then
      raise exception 'اكتب تكلفة %', v_product.name;
    end if;

    if v_product.tracking = 'imei' then
      v_imeis := array(
        select btrim(x) from jsonb_array_elements_text(coalesce(v_line -> 'imeis', '[]'::jsonb)) as x where btrim(x) <> ''
      );
      v_qty := cardinality(v_imeis);
      if v_qty = 0 then
        raise exception 'اكتب أرقام IMEI لـ %', v_product.name;
      end if;
      select string_agg(x, '، ') into v_bad from unnest(v_imeis) as x where x !~ '^\d{15}$';
      if v_bad is not null then
        raise exception 'IMEI لازم يكون 15 رقم: %', v_bad;
      end if;
      if (select count(distinct x) from unnest(v_imeis) as x) <> v_qty then
        raise exception 'فيه IMEI متكرر في %', v_product.name;
      end if;
      select string_agg(imei, '، ') into v_bad from public.phone_units where imei = any (v_imeis);
      if v_bad is not null then
        raise exception 'الـ IMEI ده متسجّل قبل كده: %', v_bad;
      end if;
      insert into public.phone_units (imei, product_id, branch_id, condition, cost, status, supplier_id)
      select x, v_product.id, v_me.branch_id, 'new', v_cost, 'in_stock', p_supplier_id from unnest(v_imeis) as x;
    else
      v_qty := (v_line ->> 'quantity')::integer;
      if v_qty is null or v_qty <= 0 then
        raise exception 'اكتب الكمية لـ %', v_product.name;
      end if;
      v_imeis := '{}';
      insert into public.product_stock as s (branch_id, product_id, quantity, avg_cost)
      values (v_me.branch_id, v_product.id, v_qty, v_cost)
      on conflict (branch_id, product_id) do update
        set avg_cost = round((s.avg_cost * s.quantity + excluded.avg_cost * excluded.quantity) / (s.quantity + excluded.quantity), 2),
            quantity = s.quantity + excluded.quantity;
    end if;
    insert into public.purchase_lines (invoice_id, product_id, name, qty, unit_cost, imeis)
    values (v_invoice, v_product.id, v_product.name, v_qty, v_cost, v_imeis);
    v_total := v_total + v_qty * v_cost;
  end loop;

  if v_paid > v_total then
    raise exception 'المدفوع أكتر من الفاتورة';
  end if;
  update public.purchase_invoices set total = v_total, paid = v_paid where id = v_invoice;
  if v_paid > 0 then
    perform private.add_movement(v_me, v_shift, 'supplier_payment', 'دفعة لـ ' || v_supplier || ' — فاتورة استلام #' || v_number,
      p_cash => case when p_via = 'cash' then -v_paid else 0 end,
      p_wallet => case when p_via = 'wallet' then -v_paid else 0 end,
      p_bank => case when p_via = 'bank' then -v_paid else 0 end,
      p_contact_id => p_supplier_id, p_purchase_id => v_invoice);
  end if;
  return jsonb_build_object('id', v_invoice, 'number', v_number, 'total', v_total);
end $$;

-- Buying a used phone from someone, paid from the drawer. The seller's ID card details are required. A
-- phone the shop sold before comes back on the same IMEI record as a used phone, its earlier sales kept as
-- history; a phone already on the shelf can't be bought twice.
-- p_seller: {name, phone, national_id}; p_inspection: battery, screen, body, box, charger, notes.
-- Returns the product's id.
create function public.buy_used_phone(
  p_product_name text, p_brand text, p_imei text, p_price numeric, p_retail_price numeric, p_seller jsonb, p_inspection jsonb
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff := private.me();
  v_shift uuid := private.work_shift(v_me);
  v_name text := btrim(coalesce(p_product_name, ''));
  v_imei text := btrim(coalesce(p_imei, ''));
  v_price numeric := private.amount(p_price);
  v_retail numeric := round(p_retail_price, 2);
  v_unit public.phone_units;
  v_product public.products;
  v_seller uuid;
begin
  if v_name = '' then
    raise exception 'اكتب اسم الموبايل';
  end if;
  if v_imei !~ '^\d{15}$' then
    raise exception 'IMEI لازم يكون 15 رقم';
  end if;
  if v_retail is null or v_retail <= v_price then
    raise exception 'سعر البيع لازم يكون أكبر من سعر الشراء';
  end if;
  if btrim(coalesce(p_seller ->> 'name', '')) = '' or btrim(coalesce(p_seller ->> 'phone', '')) = ''
     or coalesce(p_seller ->> 'national_id', '') !~ '^\d{14}$' then
    raise exception 'بيانات البائع ناقصة: الاسم والتليفون والرقم القومي (14 رقم)';
  end if;
  if jsonb_typeof(p_inspection) is distinct from 'object' then
    raise exception 'بيانات فحص الموبايل ناقصة';
  end if;

  select * into v_unit from public.phone_units where imei = v_imei for update;
  if found and v_unit.status = 'in_stock' then
    raise exception 'الموبايل ده موجود في المخزن';
  end if;

  select * into v_product from public.products where lower(name) = lower(v_name);
  if found and v_product.category <> 'used_phone' then
    raise exception 'فيه منتج جديد بنفس الاسم — زوّد «مستعمل» في الاسم';
  end if;
  if not found then
    insert into public.products (name, brand, category, tracking, retail_price)
    values (v_name, btrim(coalesce(p_brand, '')), 'used_phone', 'imei', v_retail)
    returning * into v_product;
  end if;

  v_seller := private.upsert_contact(v_me.branch_id, 'customer', p_seller ->> 'name', p_seller ->> 'phone', p_seller ->> 'national_id');
  if v_unit.imei is not null then
    update public.phone_units
       set product_id = v_product.id, branch_id = v_me.branch_id, condition = 'used', cost = v_price, status = 'in_stock',
           supplier_id = v_seller, purchased_at = now(), inspection = p_inspection, retail_price = v_retail,
           past_order_ids = case when sold_order_id is null then past_order_ids else array_append(past_order_ids, sold_order_id) end,
           sold_order_id = null
     where imei = v_imei;
  else
    insert into public.phone_units (imei, product_id, branch_id, condition, cost, status, supplier_id, inspection, retail_price)
    values (v_imei, v_product.id, v_me.branch_id, 'used', v_price, 'in_stock', v_seller, p_inspection, v_retail);
  end if;
  perform private.add_movement(v_me, v_shift, 'used_phone_purchase', v_name || ' من ' || btrim(p_seller ->> 'name'),
    p_cash => -v_price, p_contact_id => v_seller);
  return v_product.id;
end $$;

-- ---------------------------------------------------------------- prices (the owner)

-- A new selling price for one model; pieces with their own price (used phones) take it too. With
-- p_unit_cost, the pieces in stock are re-costed to today's wholesale price as well: the difference is a
-- gain (or a loss) on holding stock, kept apart from sales profit.
create function public.reprice_product(p_product_id uuid, p_retail_price numeric, p_unit_cost numeric default null) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff := private.me();
  v_price numeric := private.amount(p_retail_price);
  v_cost numeric := round(p_unit_cost, 2);
  v_product public.products;
  v_qty integer;
  v_old numeric;
begin
  perform private.require_owner(v_me);
  if v_cost is not null and v_cost < 0 then
    raise exception 'التكلفة مينفعش تبقى بالسالب';
  end if;
  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    raise exception 'المنتج مش موجود';
  end if;
  update public.products set retail_price = v_price where id = v_product.id;
  update public.phone_units set retail_price = v_price
   where product_id = v_product.id and status = 'in_stock' and retail_price is not null;
  if v_cost is null then
    return;
  end if;

  if v_product.tracking = 'imei' then
    select count(*), coalesce(sum(cost), 0) into v_qty, v_old
      from public.phone_units
     where product_id = v_product.id and branch_id = v_me.branch_id and status = 'in_stock';
    update public.phone_units set cost = v_cost
     where product_id = v_product.id and branch_id = v_me.branch_id and status = 'in_stock';
  else
    select quantity, quantity * avg_cost into v_qty, v_old
      from public.product_stock
     where product_id = v_product.id and branch_id = v_me.branch_id
       for update;
    update public.product_stock set avg_cost = v_cost where product_id = v_product.id and branch_id = v_me.branch_id;
  end if;
  if coalesce(v_qty, 0) > 0 and v_qty * v_cost <> v_old then
    insert into public.revaluations (branch_id, recorded_by, product_id, qty, old_cost, new_unit_cost, amount)
    values (v_me.branch_id, v_me.id, v_product.id, v_qty, v_old, v_cost, v_qty * v_cost - v_old);
  end if;
end $$;

-- Raise (or lower) the selling price of a whole category by a percentage, rounded to 5 pounds.
-- Returns how many products changed.
create function public.reprice_category(p_category text, p_percent numeric) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff := private.me();
  v_count integer;
begin
  perform private.require_owner(v_me);
  if coalesce(p_category, '') not in ('new_phone', 'used_phone', 'feature_phone', 'accessory') then
    raise exception 'اختار النوع';
  end if;
  if p_percent is null or p_percent = 0 or p_percent <= -100 then
    raise exception 'النسبة غلط';
  end if;
  update public.products set retail_price = greatest(5, round(retail_price * (1 + p_percent / 100) / 5) * 5)
   where category = p_category;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ---------------------------------------------------------------- settings and services (the owner)

-- The shop's settings; anything left null stays as it is. p_agent_phones: {fawry, momkn};
-- p_bonus_percent: {fawry_airtime, …} — the bonus added on agents' loads.
create function public.update_settings(
  p_shop_name text default null,
  p_address text default null,
  p_phone text default null,
  p_warranty text default null,
  p_used_warranty_days integer default null,
  p_agent_vf_fee_percent numeric default null,
  p_employee_lend_limit numeric default null,
  p_agent_phones jsonb default null,
  p_bonus_percent jsonb default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff := private.me();
  v_key text;
begin
  perform private.require_owner(v_me);
  if p_shop_name is not null and btrim(p_shop_name) = '' then
    raise exception 'اكتب اسم المحل';
  end if;
  if p_used_warranty_days < 0 or p_agent_vf_fee_percent < 0 or p_employee_lend_limit < 0 then
    raise exception 'الأرقام مينفعش تبقى بالسالب';
  end if;
  if p_agent_phones is not null then
    if jsonb_typeof(p_agent_phones) <> 'object' then
      raise exception 'أرقام المناديب غلط';
    end if;
    for v_key in select jsonb_object_keys(p_agent_phones) loop
      if v_key not in ('fawry', 'momkn') or jsonb_typeof(p_agent_phones -> v_key) <> 'string' then
        raise exception 'أرقام المناديب غلط';
      end if;
    end loop;
  end if;
  if p_bonus_percent is not null then
    if jsonb_typeof(p_bonus_percent) <> 'object' then
      raise exception 'نسبة البونص غلط';
    end if;
    for v_key in select jsonb_object_keys(p_bonus_percent) loop
      if v_key not in ('fawry_airtime', 'fawry_general', 'momkn') or jsonb_typeof(p_bonus_percent -> v_key) <> 'number'
         or (p_bonus_percent ->> v_key)::numeric < 0 then
        raise exception 'نسبة البونص غلط';
      end if;
    end loop;
  end if;
  update public.settings
     set shop_name = coalesce(btrim(p_shop_name), shop_name),
         address = coalesce(btrim(p_address), address),
         phone = coalesce(btrim(p_phone), phone),
         warranty = coalesce(btrim(p_warranty), warranty),
         used_warranty_days = coalesce(p_used_warranty_days, used_warranty_days),
         agent_vf_fee_percent = coalesce(p_agent_vf_fee_percent, agent_vf_fee_percent),
         employee_lend_limit = coalesce(p_employee_lend_limit, employee_lend_limit),
         agent_phones = coalesce(p_agent_phones, agent_phones),
         bonus_percent = bonus_percent || coalesce(p_bonus_percent, '{}'::jsonb),
         updated_at = now()
   where branch_id = v_me.branch_id;
end $$;

-- The services quick list on the sale screen, in order: [{id (null for a new one), name}]. Services left
-- out are hidden, not deleted, because past invoices point to them.
create function public.set_services(p_services jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff := private.me();
  v_item jsonb;
  v_sort bigint;
  v_name text;
  v_id uuid;
begin
  perform private.require_owner(v_me);
  if jsonb_typeof(p_services) is distinct from 'array' then
    raise exception 'قايمة الخدمات غلط';
  end if;
  update public.services set active = false where branch_id = v_me.branch_id;
  for v_item, v_sort in select value, ordinality from jsonb_array_elements(p_services) with ordinality loop
    v_name := btrim(coalesce(v_item ->> 'name', ''));
    continue when v_name = '';
    v_id := nullif(v_item ->> 'id', '')::uuid;
    update public.services set name = v_name, sort = v_sort, active = true where id = v_id and branch_id = v_me.branch_id;
    if not found then
      insert into public.services (branch_id, name, sort) values (v_me.branch_id, v_name, v_sort);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- staff (the owner)

-- Signing in (the password) is set up with the account in the next phase; this is who they are in the shop.

-- There must always be an active owner. (Callers lock the owners' rows first, so two changes at the same
-- time can't both remove the last one.)
create function private.check_owner_left() returns void
language plpgsql stable set search_path = ''
as $$
begin
  if not exists (select 1 from public.staff where role = 'admin' and active) then
    raise exception 'لازم يفضل مالك واحد على الأقل';
  end if;
end $$;

create function public.add_staff(p_name text, p_role text, p_username text, p_salary numeric default 0, p_phone text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff := private.me();
  v_username text := lower(btrim(coalesce(p_username, '')));
  v_id uuid;
begin
  perform private.require_owner(v_me);
  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'اكتب الاسم';
  end if;
  if coalesce(p_role, '') not in ('admin', 'employee') then
    raise exception 'اختار الصلاحية';
  end if;
  if coalesce(p_salary, 0) < 0 then
    raise exception 'المرتب مينفعش يبقى بالسالب';
  end if;
  if v_username !~ '^[a-z0-9._-]{2,32}$' then
    raise exception 'اسم المستخدم: حروف إنجليزي وأرقام بس، من 2 لـ 32';
  end if;
  if exists (select 1 from public.staff where username = v_username) then
    raise exception 'اسم المستخدم ده مستخدم لموظف تاني';
  end if;
  insert into public.staff (branch_id, name, role, phone, salary, username)
  values (v_me.branch_id, btrim(p_name), p_role, nullif(btrim(coalesce(p_phone, '')), ''), round(coalesce(p_salary, 0), 2), v_username)
  returning id into v_id;
  return v_id;
end $$;

-- Change someone's details, or stop (and restart) their access; anything left null stays as it is.
-- p_phone '' clears the phone.
create function public.update_staff(
  p_id uuid,
  p_name text default null,
  p_role text default null,
  p_phone text default null,
  p_salary numeric default null,
  p_username text default null,
  p_active boolean default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff := private.me();
  v_username text := lower(btrim(p_username));
begin
  perform private.require_owner(v_me);
  if p_name is not null and btrim(p_name) = '' then
    raise exception 'اكتب الاسم';
  end if;
  if p_role is not null and p_role not in ('admin', 'employee') then
    raise exception 'اختار الصلاحية';
  end if;
  if p_salary < 0 then
    raise exception 'المرتب مينفعش يبقى بالسالب';
  end if;
  if v_username is not null then
    if v_username !~ '^[a-z0-9._-]{2,32}$' then
      raise exception 'اسم المستخدم: حروف إنجليزي وأرقام بس، من 2 لـ 32';
    end if;
    if exists (select 1 from public.staff where username = v_username and id <> p_id) then
      raise exception 'اسم المستخدم ده مستخدم لموظف تاني';
    end if;
  end if;
  perform 1 from public.staff where role = 'admin' and active for update;
  update public.staff
     set name = coalesce(btrim(p_name), name),
         role = coalesce(p_role, role),
         phone = case when p_phone is null then phone else nullif(btrim(p_phone), '') end,
         salary = coalesce(round(p_salary, 2), salary),
         username = coalesce(v_username, username),
         active = coalesce(p_active, active)
   where id = p_id and branch_id = v_me.branch_id;
  if not found then
    raise exception 'الموظف مش موجود';
  end if;
  perform private.check_owner_left();
end $$;

-- Only someone with nothing recorded under their name can be deleted; otherwise stop their access instead.
create function public.delete_staff(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff := private.me();
begin
  perform private.require_owner(v_me);
  if p_id = v_me.id then
    raise exception 'مينفعش تمسح نفسك';
  end if;
  perform 1 from public.staff where role = 'admin' and active for update;
  begin
    delete from public.staff where id = p_id and branch_id = v_me.branch_id;
    if not found then
      raise exception 'الموظف مش موجود';
    end if;
  exception when foreign_key_violation then
    raise exception 'الموظف ده ليه حركات متسجّلة — اوقفه بدل ما تمسحه';
  end;
  perform private.check_owner_left();
end $$;

-- ---------------------------------------------------------------- first-time setup (the owner)

-- Starting the system with the shop's real stock and balances (the setup wizard). It runs once, on an
-- empty shop, so it can never replace real records.
--
-- p_data: {
--   cash, wallet, bank, savings, fixed_assets,          money when the system starts
--   machines: {fawry_airtime, fawry_general, momkn},    machine balances
--   reps: {fawry, momkn},                               agents' accounts: negative = the shop owes the agent
--   products: [{name, brand, category, barcode, cost, retail, qty, imeis: [...]}],
--   suppliers: [{name, phone, balance}],                balance = what the shop owes them
--   lenders: [{name, phone, remaining, notes}],         what the shop still owes each lender
--   installments: [{name, phone, national_id, remaining, monthly, next_due, guarantor_name, guarantor_phone}]
-- }
-- Returns how many of each were entered.
create function public.initialize_shop(p_data jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff := private.me();
  v_b text := v_me.branch_id;
  v_x jsonb;
  v_id uuid;
  v_name text;
  v_phone text;
  v_imei_product boolean;
  v_imeis text[];
  v_bad text;
  v_qty integer;
  v_cost numeric;
  v_retail numeric;
  v_cash numeric;
  v_wallet numeric;
  v_machines jsonb;
  v_remaining numeric;
  v_monthly numeric;
  v_months integer;
  v_customer uuid;
  v_guarantor uuid;
  v_products integer := 0;
  v_units integer := 0;
  v_suppliers integer := 0;
  v_loans integer := 0;
  v_plans integer := 0;
begin
  perform private.require_owner(v_me);
  perform pg_advisory_xact_lock(hashtextextended('initialize:' || v_b, 0));
  if exists (select 1 from public.products)
     or exists (select 1 from public.contacts where branch_id = v_b)
     or exists (select 1 from public.shifts where branch_id = v_b)
     or exists (select 1 from public.orders where branch_id = v_b)
     or exists (select 1 from public.cash_movements where branch_id = v_b)
     or exists (select 1 from public.purchase_invoices where branch_id = v_b)
     or exists (select 1 from public.loans where branch_id = v_b)
     or exists (select 1 from public.lent_out where branch_id = v_b)
     or exists (select 1 from public.installment_plans where branch_id = v_b)
     or exists (select 1 from public.payroll) then
    raise exception 'المحل اتهيّأ قبل كده — التهيئة بتتعمل مرة واحدة بس';
  end if;

  -- money
  v_cash := round((p_data ->> 'cash')::numeric, 2);
  if v_cash is null or v_cash < 0 then
    raise exception 'اكتب الكاش اللي في الدرج (ولو صفر اكتب 0)';
  end if;
  v_wallet := round(coalesce((p_data ->> 'wallet')::numeric, 0), 2);
  v_machines := jsonb_build_object(
    'fawry_airtime', round(coalesce((p_data -> 'machines' ->> 'fawry_airtime')::numeric, 0), 2),
    'fawry_general', round(coalesce((p_data -> 'machines' ->> 'fawry_general')::numeric, 0), 2),
    'momkn', round(coalesce((p_data -> 'machines' ->> 'momkn')::numeric, 0), 2)
  );
  update public.opening_balances
     set wallet = v_wallet,
         bank = round(coalesce((p_data ->> 'bank')::numeric, 0), 2),
         savings = round(coalesce((p_data ->> 'savings')::numeric, 0), 2),
         fixed_assets = round(coalesce((p_data ->> 'fixed_assets')::numeric, 0), 2),
         machines = v_machines,
         reps = jsonb_build_object(
           'fawry', round(coalesce((p_data -> 'reps' ->> 'fawry')::numeric, 0), 2),
           'momkn', round(coalesce((p_data -> 'reps' ->> 'momkn')::numeric, 0), 2)
         ),
         set_at = now()
   where branch_id = v_b;

  -- stock
  for v_x in select value from jsonb_array_elements(coalesce(p_data -> 'products', '[]'::jsonb)) loop
    v_name := btrim(coalesce(v_x ->> 'name', ''));
    if v_name = '' then
      raise exception 'فيه منتج من غير اسم';
    end if;
    if coalesce(v_x ->> 'category', '') not in ('new_phone', 'used_phone', 'feature_phone', 'accessory') then
      raise exception '%: النوع غلط', v_name;
    end if;
    v_cost := round((v_x ->> 'cost')::numeric, 2);
    v_retail := round((v_x ->> 'retail')::numeric, 2);
    if v_cost is null or v_cost <= 0 then
      raise exception '%: التكلفة مش مكتوبة', v_name;
    end if;
    if v_retail is null or v_retail <= 0 then
      raise exception '%: سعر البيع مش مكتوب', v_name;
    end if;
    if exists (select 1 from public.products where lower(name) = lower(v_name)) then
      raise exception '«%» متكرر — اجمعهم في سطر واحد', v_name;
    end if;
    v_imei_product := v_x ->> 'category' in ('new_phone', 'used_phone');
    if not v_imei_product and nullif(btrim(coalesce(v_x ->> 'barcode', '')), '') is not null
       and exists (select 1 from public.products where barcode = btrim(v_x ->> 'barcode')) then
      raise exception 'الباركود % متكرر', btrim(v_x ->> 'barcode');
    end if;
    insert into public.products (name, brand, category, tracking, barcode, retail_price)
    values (v_name, btrim(coalesce(v_x ->> 'brand', '')), v_x ->> 'category',
            case when v_imei_product then 'imei' else 'quantity' end,
            case when v_imei_product then null else nullif(btrim(coalesce(v_x ->> 'barcode', '')), '') end,
            v_retail)
    returning id into v_id;
    v_products := v_products + 1;
    if v_imei_product then
      v_imeis := array(
        select btrim(x) from jsonb_array_elements_text(coalesce(v_x -> 'imeis', '[]'::jsonb)) as x where btrim(x) <> ''
      );
      select string_agg(x, '، ') into v_bad from unnest(v_imeis) as x where x !~ '^\d{15}$';
      if v_bad is not null then
        raise exception '%: IMEI لازم يكون 15 رقم (%)', v_name, v_bad;
      end if;
      select string_agg(x, '، ') into v_bad
        from (select x from unnest(v_imeis) as x group by x having count(*) > 1
              union select imei from public.phone_units where imei = any (v_imeis)) as d;
      if v_bad is not null then
        raise exception 'IMEI متكرر: %', v_bad;
      end if;
      insert into public.phone_units (imei, product_id, branch_id, condition, cost, status)
      select x, v_id, v_b, case when v_x ->> 'category' = 'used_phone' then 'used' else 'new' end, v_cost, 'in_stock'
        from unnest(v_imeis) as x;
      v_units := v_units + cardinality(v_imeis);
    else
      v_qty := coalesce((v_x ->> 'qty')::integer, 0);
      if v_qty < 0 then
        raise exception '%: الكمية غلط', v_name;
      end if;
      insert into public.product_stock (branch_id, product_id, quantity, avg_cost) values (v_b, v_id, v_qty, v_cost);
    end if;
  end loop;

  -- what the shop owes its suppliers
  for v_x in select value from jsonb_array_elements(coalesce(p_data -> 'suppliers', '[]'::jsonb)) loop
    v_name := btrim(coalesce(v_x ->> 'name', ''));
    v_phone := btrim(coalesce(v_x ->> 'phone', ''));
    if v_name = '' then
      raise exception 'فيه مورد من غير اسم';
    end if;
    if v_phone <> '' and exists (select 1 from public.contacts where branch_id = v_b and kind = 'supplier' and phone = v_phone) then
      raise exception 'المورد % متكرر بنفس التليفون', v_name;
    end if;
    insert into public.contacts (branch_id, kind, name, phone, opening_balance)
    values (v_b, 'supplier', v_name, v_phone, round(coalesce((v_x ->> 'balance')::numeric, 0), 2));
    v_suppliers := v_suppliers + 1;
  end loop;

  -- what the shop still owes people it borrowed from
  for v_x in select value from jsonb_array_elements(coalesce(p_data -> 'lenders', '[]'::jsonb)) loop
    v_remaining := round((v_x ->> 'remaining')::numeric, 2);
    if v_remaining is null or v_remaining <= 0 then
      raise exception '%: المبلغ المتبقي صفر', coalesce(nullif(btrim(v_x ->> 'name'), ''), 'سلفة');
    end if;
    insert into public.loans (branch_id, lender_id, amount, notes)
    values (v_b, private.upsert_contact(v_b, 'lender', v_x ->> 'name', v_x ->> 'phone'), v_remaining,
            coalesce(nullif(btrim(coalesce(v_x ->> 'notes', '')), ''), 'رصيد افتتاحي'));
    v_loans := v_loans + 1;
  end loop;

  -- Installment plans from before the system: the markup was agreed before, so the remaining amount is
  -- taken as it is, in the agreed monthly installments starting on the next due date.
  for v_x in select value from jsonb_array_elements(coalesce(p_data -> 'installments', '[]'::jsonb)) loop
    v_name := coalesce(nullif(btrim(v_x ->> 'name'), ''), 'عميل');
    if btrim(coalesce(v_x ->> 'phone', '')) = '' then
      raise exception '%: الاسم والتليفون مطلوبين', v_name;
    end if;
    v_remaining := round((v_x ->> 'remaining')::numeric, 2);
    v_monthly := round((v_x ->> 'monthly')::numeric, 2);
    if v_remaining is null or v_remaining <= 0 or v_monthly is null or v_monthly <= 0 then
      raise exception '%: المتبقي والقسط الشهري مطلوبين', v_name;
    end if;
    if v_monthly > v_remaining then
      raise exception '%: القسط أكبر من المتبقي', v_name;
    end if;
    if nullif(v_x ->> 'next_due', '') is null then
      raise exception '%: تاريخ القسط الجاي مطلوب', v_name;
    end if;
    v_customer := private.upsert_contact(v_b, 'customer', v_x ->> 'name', v_x ->> 'phone', v_x ->> 'national_id');
    v_guarantor := case when btrim(coalesce(v_x ->> 'guarantor_name', '')) <> ''
      then private.upsert_contact(v_b, 'guarantor', v_x ->> 'guarantor_name', v_x ->> 'guarantor_phone') end;
    v_months := greatest(1, ceil(v_remaining / v_monthly)::integer);
    insert into public.installment_plans (branch_id, customer_id, guarantor_id, cash_price, down_payment, markup_percent, months)
    values (v_b, v_customer, v_guarantor, v_remaining, 0, 0, v_months)
    returning id into v_id;
    perform private.add_schedule(v_id, v_remaining, v_months, (v_x ->> 'next_due')::date, v_monthly, 0);
    v_plans := v_plans + 1;
  end loop;

  -- A closed "opening" shift: the first real shift's counts are compared against it.
  insert into public.shifts (branch_id, employee_id, opened_at, opening_float, closed_at, counted_cash, expected_cash, closing_count)
  values (v_b, v_me.id, now(), v_cash, now(), v_cash, v_cash, jsonb_build_object('wallet', v_wallet, 'machines', v_machines));

  return jsonb_build_object('products', v_products, 'phones', v_units, 'suppliers', v_suppliers, 'loans', v_loans, 'installment_plans', v_plans);
end $$;
