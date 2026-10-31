-- Moga ERP — staff sign-in accounts (Supabase Auth).
--
-- Each staff member signs in with a username and a password. Supabase Auth signs in by email, so the app
-- makes one from the username (username@moga-erp.vercel.app; nothing is ever sent to it). The accounts are
-- created and changed by the staff-accounts Edge Function, which holds the project's secret key: the app
-- never sees it. The functions here "for the Edge Function" can only be called with that key.

-- The one-time code that lets the owner create the shop's first account, kept hashed; marked once used.
create table private.owner_setup_codes (
  code_hash text primary key,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

-- Only the digits count, so "12345-67890" and "1234567890" are the same code.
create function private.code_hash(p_code text) returns text
language sql immutable set search_path = ''
as $$
  select encode(sha256(convert_to(regexp_replace(coalesce(p_code, ''), '\D', '', 'g'), 'UTF8')), 'hex')
$$;

-- Until the owner's account exists, the sign-in page offers to create it.
create function public.owner_setup_needed() returns boolean
language sql stable security definer set search_path = ''
as $$
  select not exists (select 1 from public.staff)
$$;

-- For the Edge Function: is the owner's account still to be made, and is this its code?
create function public.owner_setup_code_ok(p_code text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select not exists (select 1 from public.staff)
     and exists (select 1 from private.owner_setup_codes where code_hash = private.code_hash(p_code) and used_at is null)
$$;

-- For the Edge Function: the shop's first account, the owner, once their sign-in exists. Uses up the code.
-- Returns the owner's staff id.
create function public.setup_owner(p_code text, p_auth_user_id uuid, p_name text, p_username text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_username text := lower(btrim(coalesce(p_username, '')));
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('owner_setup', 0));
  if exists (select 1 from public.staff) then
    raise exception 'حساب المالك اتعمل قبل كده';
  end if;
  update private.owner_setup_codes set used_at = now() where code_hash = private.code_hash(p_code) and used_at is null;
  if not found then
    raise exception 'كود التفعيل غلط';
  end if;
  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'اكتب الاسم';
  end if;
  if v_username !~ '^[a-z0-9._-]{2,32}$' then
    raise exception 'اسم المستخدم: حروف إنجليزي وأرقام بس، من 2 لـ 32';
  end if;
  insert into public.staff (auth_user_id, name, role, username)
  values (p_auth_user_id, btrim(p_name), 'admin', v_username)
  returning id into v_id;
  return v_id;
end $$;

-- For the Edge Function: ties a staff member to the sign-in account made for them.
create function public.link_staff_login(p_staff_id uuid, p_auth_user_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.staff set auth_user_id = p_auth_user_id where id = p_staff_id;
  if not found then
    raise exception 'الموظف مش موجود';
  end if;
end $$;

-- The owner's staff page and payroll: everyone's monthly salary (reading the staff list leaves it out).
create function public.staff_salaries() returns table (staff_id uuid, salary numeric)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_me public.staff := private.me();
begin
  perform private.require_owner(v_me);
  return query select s.id, s.salary from public.staff s where s.branch_id = v_me.branch_id;
end $$;

grant execute on function public.owner_setup_needed() to anon, authenticated, service_role;
grant execute on function public.owner_setup_code_ok(text), public.setup_owner(text, uuid, text, text),
  public.link_staff_login(uuid, uuid) to service_role;
grant execute on function public.staff_salaries() to authenticated;
