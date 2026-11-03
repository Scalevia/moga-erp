-- Moga ERP — Telegram: a message when a shift opens too (who opened it, and how the drawer, the wallet and
-- the machines were taken over against what the last shift left).

-- A shift that just opened: the counts against what was expected, and the agents' loads that came in this
-- morning before it opened.
create function private.telegram_open_text(p_shift uuid) returns text
language plpgsql stable set search_path = ''
as $$
declare
  v_shift public.shifts;
  v_name text;
  v_expected numeric;
  v_diff numeric;
  v_counts text := '';
  v_loads text;
  v_since timestamptz;
  v_id text;
begin
  select * into v_shift from public.shifts where id = p_shift;
  if not found then
    return null;
  end if;
  select name into v_name from public.staff where id = v_shift.employee_id;
  v_expected := (v_shift.opening_expected ->> 'cash')::numeric;
  v_diff := v_shift.opening_float - v_expected;

  if v_shift.opening_count is not null and v_shift.opening_expected is not null then
    foreach v_id in array array['wallet', 'fawry_airtime', 'fawry_general', 'momkn'] loop
      declare
        v_d numeric := case when v_id = 'wallet'
          then (v_shift.opening_count ->> 'wallet')::numeric - (v_shift.opening_expected ->> 'wallet')::numeric
          else (v_shift.opening_count -> 'machines' ->> v_id)::numeric - (v_shift.opening_expected -> 'machines' ->> v_id)::numeric end;
      begin
        if v_d <> 0 then
          v_counts := v_counts || chr(10) || case when v_id = 'wallet' then 'فودافون كاش' else private.balance_label(v_id) end
            || ': ' || case when v_d < 0 then 'عجز ' else 'زيادة ' end || private.fmt(abs(v_d));
        end if;
      end;
    end loop;
  end if;

  -- Loads recorded before opening, since the last shift closed.
  select max(closed_at) into v_since from public.shifts
   where branch_id = v_shift.branch_id and closed_at is not null and closed_at <= v_shift.opened_at;
  select string_agg(private.balance_label(balance_id) || ' ' || private.fmt(-rep), '، ' order by created_at) into v_loads
    from public.cash_movements
   where branch_id = v_shift.branch_id and kind = 'rep_load' and shift_id is null
     and created_at <= v_shift.opened_at and (v_since is null or created_at > v_since);

  return '🟢 ' || coalesce(v_name, '—') || ' فتح الوردية · ' || private.cairo_time(v_shift.opened_at)
    || chr(10) || 'الدرج: ' || case when v_expected is null then 'اتعدّ ' || private.fmt(v_shift.opening_float)
      else 'المفروض ' || private.fmt(v_expected) || ' — اتعدّ ' || private.fmt(v_shift.opening_float) || ' — '
        || case when v_diff < 0 then 'عجز ' || private.fmt(-v_diff) when v_diff > 0 then 'زيادة ' || private.fmt(v_diff) else 'مظبوط ✅' end
      end
    || v_counts
    || coalesce(chr(10) || 'المندوب شحن قبل الفتح: ' || v_loads, '');
end $$;

create or replace function public.telegram_message(p_event text, p_id uuid) returns jsonb
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
    when 'shift_opened' then private.telegram_open_text(p_id)
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

-- A shift opened by someone (the first-time setup's shift is saved already closed, so it sends nothing).
create constraint trigger telegram_shift_opened
  after insert on public.shifts
  deferrable initially deferred
  for each row when (new.closed_at is null)
  execute function private.telegram_queue('shift_opened');
