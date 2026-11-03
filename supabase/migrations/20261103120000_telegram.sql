-- Moga ERP — the owner's Telegram: a message for every sale, and the day's figures when a shift closes.
--
-- When an invoice or a shift closing is saved (committed), the database asks the telegram-notify Edge
-- Function to send it (pg_net, after the commit: a sale that fails sends nothing). The function asks back
-- for the message text, written here from the saved records, and sends each one once only. The bot's token
-- lives with the function (an Edge Function secret); the owner's chat is linked from the settings page.

create extension if not exists pg_net;

-- The owner's chat with the bot (one row).
create table private.telegram_chat (
  id boolean primary key default true check (id),
  chat_id bigint not null,
  linked_at timestamptz not null default now()
);

-- What was already sent, so nothing goes out twice.
create table private.telegram_sent (
  kind text not null,
  ref uuid not null,
  sent_at timestamptz not null default now(),
  primary key (kind, ref)
);

-- "3:45 م" in Cairo.
create function private.cairo_time(p timestamptz) returns text
language sql stable set search_path = ''
as $$
  select to_char(p at time zone 'Africa/Cairo', 'FMHH12:MI')
    || case when extract(hour from p at time zone 'Africa/Cairo') < 12 then ' ص' else ' م' end
$$;

create function private.payment_label(p_method text) returns text
language sql immutable set search_path = ''
as $$
  select case p_method
    when 'cash' then 'نقدي'
    when 'vodafone_cash' then 'فودافون كاش'
    when 'instapay' then 'إنستاباي'
    when 'card' then 'فيزا'
    when 'installment' then 'تقسيط'
    when 'credit' then 'آجل'
  end
$$;

-- A sale: invoice, who sold it, the lines, how it was paid, and its profit.
create function private.telegram_sale_text(p_order uuid) returns text
language plpgsql stable set search_path = ''
as $$
declare
  v_order public.orders;
  v_total numeric;
  v_profit numeric;
  v_lines text;
  v_paid text;
  v_seller text;
  v_customer text;
begin
  select * into v_order from public.orders where id = p_order;
  if not found then
    return null;
  end if;
  select coalesce(sum(qty * unit_price), 0) + v_order.extra, coalesce(sum(qty * (unit_price - unit_cost)), 0) + v_order.extra,
         string_agg(chr(10) || '• ' || name || case when qty > 1 then ' × ' || qty else '' end || ' — ' || private.fmt(qty * unit_price), '' order by line_no)
    into v_total, v_profit, v_lines
    from public.order_items where order_id = p_order;
  select string_agg(private.payment_label(method) || ' ' || private.fmt(amount), ' + ') into v_paid
    from public.order_payments where order_id = p_order;
  select name into v_seller from public.staff where id = v_order.employee_id;
  select name into v_customer from public.contacts where id = v_order.customer_id;
  return '🛒 فاتورة #' || v_order.number || ' — ' || private.fmt(v_total) || ' ج.م'
    || chr(10) || coalesce(v_seller, '—') || ' · ' || private.cairo_time(v_order.created_at)
    || coalesce(v_lines, '')
    || case when v_order.extra > 0 then chr(10) || '• زيادة سابها الزبون — ' || private.fmt(v_order.extra) else '' end
    || chr(10) || 'الدفع: ' || coalesce(v_paid, 'ببلاش')
    || coalesce(chr(10) || 'الزبون: ' || v_customer, '')
    || chr(10) || 'الربح: ' || private.fmt(v_profit) || ' ج.م';
end $$;

-- A closed shift: sales, profit, money in by each way, expenses, and the counts against what was expected.
create function private.telegram_shift_text(p_shift uuid) returns text
language plpgsql stable set search_path = ''
as $$
declare
  v_shift public.shifts;
  v_name text;
  v_count integer;
  v_returned integer;
  v_sales numeric;
  v_profit numeric;
  v_ways text;
  v_expenses numeric;
  v_diff numeric;
  v_counts text := '';
  v_id text;
begin
  select * into v_shift from public.shifts where id = p_shift;
  if not found or v_shift.closed_at is null then
    return null;
  end if;
  select name into v_name from public.staff where id = v_shift.employee_id;
  select count(*), count(*) filter (where status = 'returned') into v_count, v_returned
    from public.orders where shift_id = p_shift;
  select coalesce(sum(i.qty * i.unit_price), 0), coalesce(sum(i.qty * (i.unit_price - i.unit_cost)), 0)
    into v_sales, v_profit
    from public.order_items i join public.orders o on o.id = i.order_id
   where o.shift_id = p_shift and o.status = 'completed';
  select v_sales + coalesce(sum(extra), 0), v_profit + coalesce(sum(extra), 0) into v_sales, v_profit
    from public.orders where shift_id = p_shift and status = 'completed';
  select v_profit + coalesce(sum(commission), 0), coalesce(-sum(cash) filter (where kind = 'expense'), 0)
    into v_profit, v_expenses
    from public.cash_movements where shift_id = p_shift;
  select string_agg(private.payment_label(method) || ' ' || private.fmt(total), ' · ' order by total desc) into v_ways
    from (select p.method, sum(p.amount) as total
            from public.order_payments p join public.orders o on o.id = p.order_id
           where o.shift_id = p_shift and o.status = 'completed'
           group by p.method) w;

  v_diff := v_shift.counted_cash - v_shift.expected_cash;
  if v_shift.closing_count is not null and v_shift.closing_expected is not null then
    foreach v_id in array array['wallet', 'fawry_airtime', 'fawry_general', 'momkn'] loop
      declare
        v_d numeric := case when v_id = 'wallet'
          then (v_shift.closing_count ->> 'wallet')::numeric - (v_shift.closing_expected ->> 'wallet')::numeric
          else (v_shift.closing_count -> 'machines' ->> v_id)::numeric - (v_shift.closing_expected -> 'machines' ->> v_id)::numeric end;
      begin
        if v_d <> 0 then
          v_counts := v_counts || chr(10) || case when v_id = 'wallet' then 'فودافون كاش' else private.balance_label(v_id) end
            || ': ' || case when v_d < 0 then 'عجز ' else 'زيادة ' end || private.fmt(abs(v_d));
        end if;
      end;
    end loop;
  end if;

  return '📋 تقفيل وردية ' || coalesce(v_name, '—')
    || chr(10) || to_char(v_shift.opened_at at time zone 'Africa/Cairo', 'DD/MM') || ' · '
    || private.cairo_time(v_shift.opened_at) || ' ← ' || private.cairo_time(v_shift.closed_at)
    || chr(10) || 'المبيعات: ' || private.fmt(v_sales) || ' ج.م (' || v_count || ' فاتورة'
    || case when v_returned > 0 then '، منهم ' || v_returned || ' اترجعت' else '' end || ')'
    || chr(10) || 'مجمل الربح: ' || private.fmt(v_profit) || ' ج.م'
    || coalesce(chr(10) || 'الدفع: ' || v_ways, '')
    || case when v_expenses > 0 then chr(10) || 'المصروفات: ' || private.fmt(v_expenses) || ' ج.م' else '' end
    || chr(10) || 'الدرج: المفروض ' || private.fmt(v_shift.expected_cash) || ' — اتعدّ ' || private.fmt(v_shift.counted_cash) || ' — '
    || case when v_diff < 0 then 'عجز ' || private.fmt(-v_diff) when v_diff > 0 then 'زيادة ' || private.fmt(v_diff) else 'مظبوط ✅' end
    || v_counts;
end $$;

-- For the Edge Function: the message to send for a sale or a closed shift, and where to; null when there's
-- no chat linked, nothing to say, or it was already sent (each goes out once).
create function public.telegram_message(p_event text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_chat bigint;
  v_text text;
begin
  select chat_id into v_chat from private.telegram_chat;
  if v_chat is null then
    return null;
  end if;
  v_text := case p_event
    when 'sale' then private.telegram_sale_text(p_id)
    when 'shift_closed' then private.telegram_shift_text(p_id)
  end;
  if v_text is null then
    return null;
  end if;
  insert into private.telegram_sent (kind, ref) values (p_event, p_id) on conflict do nothing;
  if not found then
    return null;
  end if;
  return jsonb_build_object('chat_id', v_chat, 'text', v_text);
end $$;

-- For the Edge Function: the owner's chat (linking it from the settings page), and which one it is.
create function public.telegram_link(p_chat_id bigint) returns void
language sql security definer set search_path = ''
as $$
  insert into private.telegram_chat (chat_id) values (p_chat_id)
  on conflict (id) do update set chat_id = excluded.chat_id, linked_at = now()
$$;

create function public.telegram_chat_id() returns bigint
language sql stable security definer set search_path = ''
as $$
  select chat_id from private.telegram_chat
$$;

grant execute on function public.telegram_message(text, uuid), public.telegram_link(bigint), public.telegram_chat_id() to service_role;

-- After a sale or a shift closing is committed, ask the Edge Function to send it (only once a chat is linked).
create function private.telegram_queue() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from private.telegram_chat) then
    perform net.http_post(
      url := 'https://dovmnegjvkrewmkmpued.supabase.co/functions/v1/telegram-notify',
      body := jsonb_build_object('event', tg_argv[0], 'id', new.id)
    );
  end if;
  return null;
end $$;

create constraint trigger telegram_sale
  after insert on public.orders
  deferrable initially deferred
  for each row execute function private.telegram_queue('sale');

create constraint trigger telegram_shift_closed
  after update of closed_at on public.shifts
  deferrable initially deferred
  for each row when (old.closed_at is null and new.closed_at is not null)
  execute function private.telegram_queue('shift_closed');
