-- Inshirah Class Fund — core schema
-- Money is stored as whole Bangladeshi taka in BIGINT columns (no fractions).
-- Nothing financial is ever deleted: corrections are reversal / void entries.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'treasurer', 'collector', 'auditor', 'pending');
create type public.payment_method as enum ('cash', 'bkash', 'nagad', 'rocket', 'bank', 'other');
create type public.student_status as enum ('active', 'archived');
create type public.month_status as enum ('open', 'closed');
create type public.expense_status as enum ('pending', 'approved', 'rejected', 'void');
create type public.handover_status as enum ('pending', 'confirmed', 'rejected');

-- Private schema (not exposed through the API)
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create table app_private.config (
  id boolean primary key default true check (id),
  bootstrap_admin_email text
);
insert into app_private.config (bootstrap_admin_email) values (null);

-- ---------------------------------------------------------------------------
-- Settings (single row)
-- ---------------------------------------------------------------------------
create table public.app_settings (
  id boolean primary key default true check (id),
  app_name text not null default 'Inshirah Class Fund',
  class_name text not null default 'Inshirah Class',
  currency_symbol text not null default '৳',
  opening_balance bigint not null default 0,
  opening_balance_note text,
  other_income_enabled boolean not null default false,
  public_dashboard_enabled boolean not null default true,
  public_show_expense_items boolean not null default true,
  public_birthdays_enabled boolean not null default false,
  max_collectors int not null default 10 check (max_collectors between 1 and 50),
  timezone text not null default 'Asia/Dhaka',
  updated_by uuid,
  updated_at timestamptz not null default now()
);
insert into public.app_settings default values;

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  phone text,
  role public.app_role not null default 'pending',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role) where is_active;

-- ---------------------------------------------------------------------------
-- Students
-- ---------------------------------------------------------------------------
create table public.students (
  id uuid primary key default gen_random_uuid(),
  roll text not null,
  name text not null check (length(trim(name)) between 1 and 120),
  phone text check (phone is null or length(phone) <= 25),
  email text check (email is null or length(email) <= 254),
  birthdate date check (birthdate is null or birthdate between date '1950-01-01' and current_date),
  class_name text,
  group_name text,
  notes text,
  status public.student_status not null default 'active',
  joined_on date not null default (now() at time zone 'Asia/Dhaka')::date,
  archived_at timestamptz,
  legacy_id text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint students_roll_format check (length(trim(roll)) between 1 and 30)
);
create unique index students_roll_unique on public.students (lower(trim(roll)));
create index students_status_idx on public.students (status);
create index students_birth_md_idx on public.students ((extract(month from birthdate)), (extract(day from birthdate))) where birthdate is not null;

-- Collector ↔ student assignment history (one active assignment per student)
create table public.student_collector_assignments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id),
  collector_id uuid not null references public.profiles (id),
  assigned_by uuid references public.profiles (id),
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz,
  unassigned_by uuid references public.profiles (id)
);
create unique index sca_one_active_per_student on public.student_collector_assignments (student_id) where unassigned_at is null;
create index sca_collector_active_idx on public.student_collector_assignments (collector_id) where unassigned_at is null;

-- ---------------------------------------------------------------------------
-- Financial months
-- ---------------------------------------------------------------------------
create table public.fund_months (
  id uuid primary key default gen_random_uuid(),
  year int not null check (year between 2000 and 2100),
  month int not null check (month between 1 and 12),
  title_en text not null,
  title_bn text not null,
  contribution_amount bigint not null check (contribution_amount >= 0),
  special_amount bigint not null default 0 check (special_amount >= 0),
  special_label text,
  deadline date,
  status public.month_status not null default 'open',
  notes text,
  -- frozen snapshot, written only when the month is closed
  closed_at timestamptz,
  closed_by uuid references public.profiles (id),
  snapshot jsonb,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (year, month)
);

-- ---------------------------------------------------------------------------
-- Payments (append-only; reversals are negative rows)
-- ---------------------------------------------------------------------------
create sequence public.payment_receipt_seq;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  receipt_no text not null unique,
  student_id uuid not null references public.students (id),
  month_id uuid not null references public.fund_months (id),
  amount bigint not null,
  method public.payment_method not null,
  paid_on date not null,
  collected_by uuid not null references public.profiles (id),
  transaction_ref text check (transaction_ref is null or length(transaction_ref) <= 80),
  note text check (note is null or length(note) <= 500),
  reversal_of uuid unique references public.payments (id),
  reversal_reason text,
  client_ref uuid unique,
  legacy_id text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint payments_sign check (
    (reversal_of is null and amount > 0) or
    (reversal_of is not null and amount < 0 and reversal_reason is not null)
  )
);
create index payments_month_idx on public.payments (month_id);
create index payments_student_month_idx on public.payments (student_id, month_id);
create index payments_collector_idx on public.payments (collected_by);

-- ---------------------------------------------------------------------------
-- Waivers
-- ---------------------------------------------------------------------------
create table public.waivers (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id),
  month_id uuid not null references public.fund_months (id),
  amount bigint not null check (amount > 0),
  reason text not null check (length(trim(reason)) >= 3),
  approved_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id),
  revoke_reason text
);
create unique index waivers_one_active on public.waivers (student_id, month_id) where revoked_at is null;
create index waivers_month_idx on public.waivers (month_id);

-- ---------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------
create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name_en text not null,
  name_bn text not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (name_en)
);

create sequence public.expense_no_seq;

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_no text not null unique,
  title text not null check (length(trim(title)) between 2 and 120),
  category_id uuid not null references public.expense_categories (id),
  month_id uuid not null references public.fund_months (id),
  amount bigint not null check (amount > 0),
  spent_on date not null,
  description text check (description is null or length(description) <= 1000),
  payment_method public.payment_method not null default 'cash',
  receipt_path text,
  status public.expense_status not null default 'pending',
  submitted_by uuid not null references public.profiles (id),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  rejection_reason text,
  void_reason text,
  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- nobody may approve an expense they submitted themselves
  constraint expenses_no_self_approval check (status <> 'approved' or decided_by is distinct from submitted_by)
);
create index expenses_month_status_idx on public.expenses (month_id, status);
create index expenses_submitter_idx on public.expenses (submitted_by);

-- ---------------------------------------------------------------------------
-- Other income (optional, behind a setting)
-- ---------------------------------------------------------------------------
create table public.other_income (
  id uuid primary key default gen_random_uuid(),
  month_id uuid not null references public.fund_months (id),
  source text not null check (length(trim(source)) between 2 and 80),
  amount bigint not null check (amount > 0),
  received_on date not null,
  method public.payment_method not null default 'cash',
  note text,
  recorded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles (id),
  void_reason text
);
create index other_income_month_idx on public.other_income (month_id) where voided_at is null;

-- ---------------------------------------------------------------------------
-- Cash handovers (internal transfer — never income)
-- ---------------------------------------------------------------------------
create sequence public.handover_no_seq;

create table public.handovers (
  id uuid primary key default gen_random_uuid(),
  handover_no text not null unique,
  collector_id uuid not null references public.profiles (id),
  amount bigint not null check (amount > 0),
  method public.payment_method not null default 'cash',
  handed_at timestamptz not null default now(),
  reference text,
  note text,
  status public.handover_status not null default 'pending',
  received_by uuid references public.profiles (id),
  decided_at timestamptz,
  reject_reason text,
  client_ref uuid unique,
  created_at timestamptz not null default now()
);
create index handovers_collector_idx on public.handovers (collector_id, status);

-- ---------------------------------------------------------------------------
-- Notifications (one row per recipient)
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title_en text not null,
  title_bn text not null,
  body_en text,
  body_bn text,
  link text,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Audit log (written only by triggers / security-definer functions)
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_role text,
  action text not null,
  table_name text not null,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_table_record_idx on public.audit_logs (table_name, record_id);

-- Default expense categories (bilingual)
insert into public.expense_categories (name_en, name_bn, sort_order) values
  ('Food and Snacks', 'খাবার ও নাস্তা', 1),
  ('Printing', 'প্রিন্টিং', 2),
  ('Transportation', 'যাতায়াত', 3),
  ('Events', 'অনুষ্ঠান', 4),
  ('Educational Materials', 'শিক্ষা উপকরণ', 5),
  ('Stationery', 'স্টেশনারি', 6),
  ('Miscellaneous', 'বিবিধ', 7);
