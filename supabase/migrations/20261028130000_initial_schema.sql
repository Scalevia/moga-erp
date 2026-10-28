-- Moga ERP — initial schema.
--
-- Every table belongs to a branch: one today, a second one and the websites later.
-- Signed-in staff can read through row-level security; nobody writes to a table directly.
-- Every change (a sale, a return, closing a shift…) goes through server functions added in the
-- next migration, which check who is asking and do the whole operation at once.
-- Money is numeric(14,2) in EGP. Timestamps are timestamptz; reports use Cairo days.

-- ---------------------------------------------------------------- helpers (not exposed by the API)

create schema if not exists private;

-- ---------------------------------------------------------------- branches, staff, settings

create table public.branches (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);
insert into public.branches (id, name) values ('main', 'الفرع الرئيسي');

-- Who someone is in the shop. Their sign-in (password, sessions) lives in auth.users.
create table public.staff (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  branch_id text not null default 'main' references public.branches (id),
  name text not null check (name <> ''),
  role text not null check (role in ('admin', 'employee')), -- admin = owner
  phone text,
  salary numeric(12, 2) not null default 0 check (salary >= 0),
  username text not null unique check (username ~ '^[a-z0-9._-]{2,32}$'),
  active boolean not null default true, -- deactivated staff can't sign in but keep their history
  created_at timestamptz not null default now()
);

create table public.settings (
  branch_id text primary key references public.branches (id),
  shop_name text not null default 'موجه للموبايلات',
  address text not null default '',
  phone text not null default '',
  warranty text not null default '',
  used_warranty_days integer not null default 14 check (used_warranty_days >= 0),
  agent_vf_fee_percent numeric(5, 2) not null default 1 check (agent_vf_fee_percent >= 0),
  employee_lend_limit numeric(12, 2) not null default 1000 check (employee_lend_limit >= 0),
  agent_phones jsonb not null default '{}',
  -- Fawry adds a bonus on Air time loads: pay 1,000 → 1,010 on the balance.
  bonus_percent jsonb not null default '{"fawry_airtime": 1, "fawry_general": 0, "momkn": 0}',
  updated_at timestamptz not null default now()
);
insert into public.settings (branch_id) values ('main');

-- Balances when the system started (the setup wizard). Movements are added on top.
create table public.opening_balances (
  branch_id text primary key references public.branches (id),
  wallet numeric(14, 2) not null default 0,
  bank numeric(14, 2) not null default 0,
  savings numeric(14, 2) not null default 0, -- paid into the جمعية and not collected yet
  fixed_assets numeric(14, 2) not null default 0,
  machines jsonb not null default '{"fawry_airtime": 0, "fawry_general": 0, "momkn": 0}',
  reps jsonb not null default '{"fawry": 0, "momkn": 0}', -- agent accounts: negative = the shop owes the agent
  set_at timestamptz
);
insert into public.opening_balances (branch_id) values ('main');

-- The services quick list on the sale screen (editable in settings).
create table public.services (
  id uuid primary key default gen_random_uuid(),
  branch_id text not null default 'main' references public.branches (id),
  name text not null check (name <> ''),
  sort integer not null default 0,
  active boolean not null default true
);
insert into public.services (name, sort) values
  ('عمل حساب جوجل / متجر', 1),
  ('تحميل برامج وألعاب', 2),
  ('نقل بيانات من موبايل لموبايل', 3),
  ('تحديث سوفت وير / فورمات', 4),
  ('إعداد واتساب أو آي كلاود', 5);

-- ---------------------------------------------------------------- people

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  branch_id text not null default 'main' references public.branches (id),
  kind text not null check (kind in ('customer', 'supplier', 'lender', 'guarantor', 'borrower')),
  name text not null check (name <> ''),
  phone text not null default '',
  national_id text check (national_id ~ '^\d{14}$'),
  opening_balance numeric(14, 2) not null default 0, -- suppliers: what the shop owed them when the system started
  created_at timestamptz not null default now()
);
-- The same phone is the same person (per kind): a second loan joins the first one's statement.
create unique index contacts_phone_per_kind on public.contacts (branch_id, kind, phone) where phone <> '';

-- ---------------------------------------------------------------- stock

-- One catalog for every branch and channel; stock is kept per branch.
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name <> ''),
  brand text not null default '',
  category text not null check (category in ('new_phone', 'used_phone', 'feature_phone', 'accessory')),
  tracking text not null check (tracking in ('imei', 'quantity')),
  barcode text unique,
  retail_price numeric(12, 2) not null check (retail_price >= 0),
  created_at timestamptz not null default now()
);
create unique index products_name_key on public.products (lower(name));

-- Quantity items (accessories, feature phones): how many each branch has, at what average cost.
create table public.product_stock (
  branch_id text not null references public.branches (id),
  product_id uuid not null references public.products (id) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0), -- no selling below zero
  avg_cost numeric(12, 2) not null default 0 check (avg_cost >= 0),
  primary key (branch_id, product_id)
);

-- Phones, one row per IMEI for its whole life: bought, sold, returned, bought back, sold again.
create table public.phone_units (
  imei text primary key check (imei ~ '^\d{15}$'),
  product_id uuid not null references public.products (id),
  branch_id text not null default 'main' references public.branches (id),
  condition text not null check (condition in ('new', 'used')),
  cost numeric(12, 2) not null check (cost >= 0),
  status text not null default 'in_stock' check (status in ('in_stock', 'sold', 'returned', 'reserved')),
  supplier_id uuid references public.contacts (id), -- the supplier, or the person a used phone was bought from
  purchased_at timestamptz not null default now(),
  inspection jsonb, -- used phones: battery, screen, body, box, charger, notes
  retail_price numeric(12, 2) check (retail_price >= 0), -- used phones have their own price
  sold_order_id uuid,
  past_order_ids uuid[] not null default '{}' -- earlier sales, when it was bought back
);

-- ---------------------------------------------------------------- shifts

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  branch_id text not null default 'main' references public.branches (id),
  employee_id uuid not null references public.staff (id),
  opened_at timestamptz not null default now(),
  opening_float numeric(14, 2) not null, -- the cash counted at opening
  opening_count jsonb, -- {wallet, machines: {fawry_airtime, fawry_general, momkn}}
  opening_expected jsonb, -- what the previous close left: {cash, wallet, machines}
  previous_employee_id uuid references public.staff (id),
  closed_at timestamptz,
  counted_cash numeric(14, 2),
  expected_cash numeric(14, 2),
  closing_count jsonb,
  closing_expected jsonb,
  check ((closed_at is null) = (counted_cash is null))
);
-- One person works a shift: one open shift per branch at a time.
create unique index shifts_one_open_per_branch on public.shifts (branch_id) where closed_at is null;

-- ---------------------------------------------------------------- sales

create sequence public.order_number_seq;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  number bigint not null unique default nextval('public.order_number_seq'),
  branch_id text not null default 'main' references public.branches (id),
  channel text not null default 'pos' check (channel in ('pos', 'b2c', 'b2b')), -- the websites come later
  created_at timestamptz not null default now(),
  employee_id uuid references public.staff (id),
  shift_id uuid references public.shifts (id),
  customer_id uuid references public.contacts (id),
  status text not null default 'completed' check (status in ('completed', 'returned')),
  extra numeric(12, 2) not null default 0 check (extra >= 0), -- paid over the price and left it
  installment_plan_id uuid,
  returned_at timestamptz,
  returned_by uuid references public.staff (id),
  return_reason text,
  check ((status = 'returned') = (returned_at is not null))
);
alter sequence public.order_number_seq owned by public.orders.number;
alter table public.phone_units add constraint phone_units_sold_order_fk foreign key (sold_order_id) references public.orders (id);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  line_no integer not null,
  category text not null check (category in ('new_phone', 'used_phone', 'feature_phone', 'accessory', 'service')),
  product_id uuid references public.products (id),
  service_id uuid references public.services (id), -- null for "أخرى"
  name text not null,
  imei text references public.phone_units (imei),
  qty integer not null check (qty > 0),
  note text, -- services: what was done
  list_price numeric(12, 2) check (list_price >= 0), -- shelf price before the discount
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  unit_cost numeric(12, 2) not null default 0 check (unit_cost >= 0),
  unique (order_id, line_no),
  check (category = 'service' or product_id is not null)
);

create table public.order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  -- installment = financed by the shop · credit = left on the customer's account (آجل)
  method text not null check (method in ('cash', 'vodafone_cash', 'instapay', 'card', 'installment', 'credit')),
  amount numeric(14, 2) not null check (amount > 0)
);

-- ---------------------------------------------------------------- installments

create table public.installment_plans (
  id uuid primary key default gen_random_uuid(),
  branch_id text not null default 'main' references public.branches (id),
  order_id uuid references public.orders (id), -- null for plans entered in the setup wizard
  customer_id uuid not null references public.contacts (id),
  guarantor_id uuid references public.contacts (id),
  cash_price numeric(14, 2) not null check (cash_price >= 0),
  down_payment numeric(14, 2) not null default 0 check (down_payment >= 0),
  markup_percent numeric(5, 2) not null default 0 check (markup_percent >= 0),
  months integer not null check (months > 0),
  start_date timestamptz not null default now(),
  cancelled_at timestamptz, -- the sale was returned: nothing more to collect
  created_at timestamptz not null default now()
);
alter table public.orders add constraint orders_installment_plan_fk foreign key (installment_plan_id) references public.installment_plans (id);

create table public.installment_dues (
  plan_id uuid not null references public.installment_plans (id) on delete cascade,
  n integer not null check (n > 0),
  due_date date not null,
  amount numeric(14, 2) not null check (amount >= 0),
  paid numeric(14, 2) not null default 0 check (paid >= 0 and paid <= amount),
  primary key (plan_id, n)
);

-- ---------------------------------------------------------------- receiving stock

create sequence public.purchase_number_seq;

create table public.purchase_invoices (
  id uuid primary key default gen_random_uuid(),
  number bigint not null unique default nextval('public.purchase_number_seq'),
  branch_id text not null default 'main' references public.branches (id),
  supplier_id uuid not null references public.contacts (id),
  supplier_ref text, -- the supplier's own invoice number
  created_at timestamptz not null default now(),
  employee_id uuid references public.staff (id),
  total numeric(14, 2) not null check (total >= 0),
  paid numeric(14, 2) not null default 0 check (paid >= 0 and paid <= total),
  via text not null default 'cash' check (via in ('cash', 'wallet', 'bank'))
);
alter sequence public.purchase_number_seq owned by public.purchase_invoices.number;

create table public.purchase_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.purchase_invoices (id) on delete cascade,
  product_id uuid not null references public.products (id),
  name text not null,
  qty integer not null check (qty > 0),
  unit_cost numeric(12, 2) not null check (unit_cost >= 0),
  imeis text[] not null default '{}'
);

-- ---------------------------------------------------------------- money movements

-- Every amount of money that moves and isn't a sale's payment: expenses, Vodafone Cash and Fawry
-- operations, agent loads and payments, loans, refunds, count differences… Each row says what it did
-- to the drawer (cash), the wallet, the bank, a machine balance (topup) and an agent account (rep).
create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  branch_id text not null default 'main' references public.branches (id),
  created_at timestamptz not null default now(),
  shift_id uuid references public.shifts (id), -- null: recorded before the shift opened (agent loads)
  employee_id uuid references public.staff (id),
  kind text not null check (kind in (
    'expense', 'employee_advance', 'owner_contribution', 'owner_drawing', 'loan_received', 'loan_repayment',
    'asset_purchase', 'savings_payment', 'savings_collection', 'supplier_payment', 'used_phone_purchase',
    'vf_deposit', 'vf_withdrawal', 'wallet_liquidation', 'topup_sale', 'rep_payment', 'rep_load', 'lent_out',
    'salary_payment', 'refund', 'lent_repaid', 'installment_collection', 'credit_collection', 'count_adjustment'
  )),
  cash numeric(14, 2) not null default 0,
  wallet numeric(14, 2) not null default 0,
  bank numeric(14, 2) not null default 0,
  topup numeric(14, 2) not null default 0, -- effect on machine balance `balance_id`
  commission numeric(14, 2) not null default 0, -- profit (or, negative, a fee) with no sale line of its own
  machine_id text check (machine_id in ('fawry', 'momkn')),
  balance_id text check (balance_id in ('fawry_airtime', 'fawry_general', 'momkn')),
  rep numeric(14, 2), -- agent account: + the agent owes us, − we owe the agent
  target_employee_id uuid references public.staff (id), -- whose advance / salary
  contact_id uuid references public.contacts (id), -- supplier paid, customer collected from…
  plan_id uuid references public.installment_plans (id),
  order_id uuid references public.orders (id), -- refunds
  purchase_id uuid references public.purchase_invoices (id), -- paid at delivery
  category text, -- expense category (إيجار، كهرباء…)
  description text not null default ''
);

-- ---------------------------------------------------------------- loans both ways

-- Money the shop borrowed from someone.
create table public.loans (
  id uuid primary key default gen_random_uuid(),
  branch_id text not null default 'main' references public.branches (id),
  lender_id uuid not null references public.contacts (id),
  amount numeric(14, 2) not null check (amount > 0),
  repaid numeric(14, 2) not null default 0 check (repaid >= 0),
  forgiven numeric(14, 2) not null default 0 check (forgiven >= 0), -- the lender let the shop off this part
  received_at timestamptz not null default now(),
  received_by uuid references public.staff (id),
  notes text,
  check (repaid + forgiven <= amount)
);

create table public.loan_events (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans (id) on delete cascade,
  at timestamptz not null default now(),
  type text not null check (type in ('repaid', 'forgiven')),
  amount numeric(14, 2) not null check (amount > 0),
  recorded_by uuid references public.staff (id),
  via text check (via in ('cash', 'wallet')),
  note text
);

-- Money the shop lent to someone (a neighbour, a friend) — still shop money, expected back.
create table public.lent_out (
  id uuid primary key default gen_random_uuid(),
  branch_id text not null default 'main' references public.branches (id),
  borrower_id uuid not null references public.contacts (id),
  amount numeric(14, 2) not null check (amount > 0),
  repaid numeric(14, 2) not null default 0 check (repaid >= 0),
  forgiven numeric(14, 2) not null default 0 check (forgiven >= 0), -- written off by the shop: a loss
  given_at timestamptz not null default now(),
  due_date date not null,
  given_by uuid references public.staff (id),
  notes text,
  check (repaid + forgiven <= amount)
);

create table public.lent_events (
  id uuid primary key default gen_random_uuid(),
  lent_id uuid not null references public.lent_out (id) on delete cascade,
  at timestamptz not null default now(),
  type text not null check (type in ('repaid', 'forgiven')),
  amount numeric(14, 2) not null check (amount > 0),
  recorded_by uuid references public.staff (id),
  via text check (via in ('cash', 'wallet')),
  note text
);

-- ---------------------------------------------------------------- owner's books

create table public.payroll (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.staff (id),
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  salary numeric(12, 2) not null check (salary >= 0),
  advances numeric(12, 2) not null default 0 check (advances >= 0), -- deducted from this salary
  net numeric(12, 2) not null check (net >= 0),
  paid_at timestamptz not null default now(),
  via text not null check (via in ('cash', 'wallet', 'bank')),
  unique (employee_id, month)
);

-- The owner re-costed stock because prices moved: a gain (or loss) apart from sales profit.
create table public.revaluations (
  id uuid primary key default gen_random_uuid(),
  branch_id text not null default 'main' references public.branches (id),
  at timestamptz not null default now(),
  recorded_by uuid references public.staff (id),
  product_id uuid not null references public.products (id),
  qty integer not null check (qty > 0),
  old_cost numeric(14, 2) not null,
  new_unit_cost numeric(12, 2) not null check (new_unit_cost >= 0),
  amount numeric(14, 2) not null
);

-- ---------------------------------------------------------------- indexes (foreign keys and common filters)

create index on public.staff (branch_id);
create index on public.services (branch_id);
create index on public.contacts (branch_id, kind);
create index on public.product_stock (product_id);
create index on public.phone_units (product_id, status);
create index on public.phone_units (branch_id, status);
create index on public.phone_units (supplier_id);
create index on public.phone_units (sold_order_id);
create index on public.shifts (branch_id, opened_at);
create index on public.shifts (employee_id);
create index on public.shifts (previous_employee_id);
create index on public.orders (branch_id, created_at);
create index on public.orders (employee_id);
create index on public.orders (shift_id);
create index on public.orders (customer_id);
create index on public.orders (returned_by);
create index on public.orders (installment_plan_id);
create index on public.order_items (product_id);
create index on public.order_items (service_id);
create index on public.order_items (imei);
create index on public.order_payments (order_id);
create index on public.installment_plans (branch_id);
create index on public.installment_plans (order_id);
create index on public.installment_plans (customer_id);
create index on public.installment_plans (guarantor_id);
create index on public.purchase_invoices (branch_id, created_at);
create index on public.purchase_invoices (supplier_id);
create index on public.purchase_invoices (employee_id);
create index on public.purchase_lines (invoice_id);
create index on public.purchase_lines (product_id);
create index on public.cash_movements (branch_id, created_at);
create index on public.cash_movements (shift_id);
create index on public.cash_movements (employee_id);
create index on public.cash_movements (target_employee_id);
create index on public.cash_movements (contact_id);
create index on public.cash_movements (plan_id);
create index on public.cash_movements (order_id);
create index on public.cash_movements (purchase_id);
create index on public.loans (branch_id);
create index on public.loans (lender_id);
create index on public.loans (received_by);
create index on public.loan_events (loan_id);
create index on public.loan_events (recorded_by);
create index on public.lent_out (branch_id);
create index on public.lent_out (borrower_id);
create index on public.lent_out (given_by);
create index on public.lent_events (lent_id);
create index on public.lent_events (recorded_by);
create index on public.revaluations (branch_id);
create index on public.revaluations (recorded_by);
create index on public.revaluations (product_id);

-- ---------------------------------------------------------------- who is asking

-- Security-definer helpers for the policies, kept out of the API (private schema).
create function private.current_staff_id() returns uuid
language sql stable security definer set search_path = ''
as $$
  select id from public.staff where auth_user_id = (select auth.uid()) and active
$$;

create function private.is_staff() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.staff where auth_user_id = (select auth.uid()) and active)
$$;

create function private.is_owner() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.staff where auth_user_id = (select auth.uid()) and active and role = 'admin')
$$;

revoke all on schema private from public;
grant usage on schema private to authenticated;
revoke execute on all functions in schema private from public;
grant execute on function private.current_staff_id(), private.is_staff(), private.is_owner() to authenticated;

-- ---------------------------------------------------------------- access

-- Start from nothing: the anonymous key can't read anything, and nobody can write directly.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

do $$
declare t text;
begin
  -- Staff of the shop can read the day-to-day tables.
  foreach t in array array[
    'branches', 'settings', 'opening_balances', 'services', 'contacts', 'products', 'product_stock',
    'phone_units', 'shifts', 'orders', 'order_items', 'order_payments', 'installment_plans',
    'installment_dues', 'purchase_invoices', 'purchase_lines', 'cash_movements', 'loans', 'loan_events',
    'lent_out', 'lent_events'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy "staff read" on public.%I for select to authenticated using ((select private.is_staff()))', t);
  end loop;
end $$;

-- Staff list: everyone sees names and roles (who recorded what); salaries only through the owner's functions.
alter table public.staff enable row level security;
grant select (id, auth_user_id, branch_id, name, role, phone, username, active, created_at) on public.staff to authenticated;
create policy "staff read" on public.staff for select to authenticated using ((select private.is_staff()));

-- Salaries: the owner sees all; an employee sees their own (for their advances).
alter table public.payroll enable row level security;
grant select on public.payroll to authenticated;
create policy "owner or own" on public.payroll for select to authenticated
  using ((select private.is_owner()) or employee_id = (select private.current_staff_id()));

-- Re-costing stock is the owner's.
alter table public.revaluations enable row level security;
grant select on public.revaluations to authenticated;
create policy "owner read" on public.revaluations for select to authenticated using ((select private.is_owner()));
