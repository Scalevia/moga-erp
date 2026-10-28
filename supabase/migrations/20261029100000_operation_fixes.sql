-- Moga ERP — server operations: fixes after a second review.
--
-- - Receiving stock: used phones come in only by buying a used phone (with the seller's ID card and the
--   inspection), as on the receiving screen; a delivery can't add them as new pieces.
-- - The refund preview of an invoice that was already returned says so instead of showing amounts.
-- - Two helpers are marked stable, like the built-in functions they use (to_char, jsonb_build_object).

create or replace function public.receive_delivery(
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
    if v_product.category = 'used_phone' then
      raise exception 'الموبايلات المستعملة بتتسجل من «شراء مستعمل»، مش من استلام البضاعة';
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

create or replace function public.refund_preview(p_order_id uuid, p_via text default null) returns jsonb
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
  if v_order.status = 'returned' then
    raise exception 'الفاتورة دي اترجعت قبل كده';
  end if;
  return private.refund_for(v_order, p_via);
end $$;

alter function private.fmt(numeric) stable;
alter function private.parse_count(jsonb) stable;
