-- Helper functions, triggers, audit trail and financial views

-- ---------------------------------------------------------------------------
-- Role helpers (SECURITY DEFINER so RLS policies can call them without recursion)
-- ---------------------------------------------------------------------------
create or replace function public.my_role()
returns public.app_role
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select p.role from public.profiles p where p.id = auth.uid() and p.is_active),
    'pending'::public.app_role)
$$;

create or replace function public.has_role(roles public.app_role[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.my_role() = any (roles)
$$;

create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.my_role() in ('admin', 'treasurer', 'collector', 'auditor')
$$;

-- True when the current user is the active collector of this student
create or replace function public.is_my_student(p_student uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.student_collector_assignments a
    where a.student_id = p_student and a.collector_id = auth.uid() and a.unassigned_at is null
  )
$$;

create or replace function app_private.require_role(roles public.app_role[])
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not (public.my_role() = any (roles)) then
    raise exception 'Permission denied for role %', public.my_role() using errcode = '42501';
  end if;
end $$;

create or replace function app_private.dhaka_today()
returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Dhaka')::date
$$;

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create or replace function app_private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger trg_profiles_touch before update on public.profiles for each row execute function app_private.touch_updated_at();
create trigger trg_students_touch before update on public.students for each row execute function app_private.touch_updated_at();
create trigger trg_months_touch before update on public.fund_months for each row execute function app_private.touch_updated_at();
create trigger trg_expenses_touch before update on public.expenses for each row execute function app_private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Audit trail
-- ---------------------------------------------------------------------------
create or replace function app_private.audit_row()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_id text;
begin
  v_id := coalesce(
    case when tg_op = 'DELETE' then to_jsonb(old) ->> 'id' else to_jsonb(new) ->> 'id' end, '');
  insert into public.audit_logs (actor_id, actor_role, action, table_name, record_id, old_data, new_data, reason)
  values (
    auth.uid(),
    (select p.role::text from public.profiles p where p.id = auth.uid()),
    lower(tg_op),
    tg_table_name,
    v_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    nullif(current_setting('app.audit_reason', true), '')
  );
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','students','student_collector_assignments','fund_months','payments',
                           'waivers','expenses','expense_categories','other_income','handovers','app_settings']
  loop
    execute format('create trigger trg_%I_audit after insert or update or delete on public.%I
                    for each row execute function app_private.audit_row()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------

-- Profiles: role / active flag may only change through set_user_role()
create or replace function app_private.guard_profile_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.role is distinct from old.role or new.is_active is distinct from old.is_active
      or new.email is distinct from old.email or new.id is distinct from old.id)
     and coalesce(current_setting('app.allow_role_change', true), '') <> 'on' then
    raise exception 'Role, status and email can only be changed by an administrator' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_profiles_guard before update on public.profiles for each row execute function app_private.guard_profile_update();

-- Collector cap
create or replace function app_private.guard_collector_cap()
returns trigger language plpgsql set search_path = '' as $$
declare v_count int; v_max int;
begin
  if new.role = 'collector' and new.is_active and (tg_op = 'INSERT' or old.role <> 'collector' or not old.is_active) then
    select count(*) into v_count from public.profiles where role = 'collector' and is_active and id <> new.id;
    select max_collectors into v_max from public.app_settings;
    if v_count >= v_max then
      raise exception 'Maximum of % collectors reached', v_max using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger trg_profiles_collector_cap before insert or update on public.profiles for each row execute function app_private.guard_collector_cap();

-- Closed months are frozen: no edits to their settings except reopening via RPC
create or replace function app_private.guard_closed_month()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'closed' and coalesce(current_setting('app.month_transition', true), '') <> 'on' then
    raise exception 'This month is closed. Reopen it before making changes.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger trg_months_guard before update on public.fund_months for each row execute function app_private.guard_closed_month();

-- Expenses: status / decision columns only change through RPCs; submitter may edit pending rows
create or replace function app_private.guard_expense_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('app.expense_decision', true), '') = 'on' then
    return new;
  end if;
  if old.status <> 'pending' then
    raise exception 'Only pending expenses can be edited' using errcode = '42501';
  end if;
  if new.status is distinct from old.status or new.decided_by is distinct from old.decided_by
     or new.decided_at is distinct from old.decided_at or new.submitted_by is distinct from old.submitted_by
     or new.expense_no is distinct from old.expense_no then
    raise exception 'Expense status can only change through approval' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_expenses_guard before update on public.expenses for each row execute function app_private.guard_expense_update();

-- Expenses: number + forced pending status on insert
create or replace function app_private.prepare_expense_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.fund_months m where m.id = new.month_id and m.status = 'closed') then
    raise exception 'Cannot add an expense to a closed month' using errcode = 'P0001';
  end if;
  new.expense_no := 'EXP-' || to_char(now() at time zone 'Asia/Dhaka', 'YYYY') || '-' || lpad(nextval('public.expense_no_seq')::text, 5, '0');
  new.status := 'pending';
  new.decided_by := null;
  new.decided_at := null;
  new.submitted_by := auth.uid();
  return new;
end $$;
create trigger trg_expenses_prepare before insert on public.expenses for each row execute function app_private.prepare_expense_insert();

-- ---------------------------------------------------------------------------
-- New auth user → profile. The first admin is bootstrapped by email.
-- ---------------------------------------------------------------------------
create or replace function app_private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_role public.app_role := 'pending';
  v_boot text;
  v_meta_role text;
begin
  select lower(bootstrap_admin_email) into v_boot from app_private.config;
  if v_boot is not null and lower(new.email) = v_boot
     and not exists (select 1 from public.profiles where role = 'admin') then
    v_role := 'admin';
  else
    -- accounts created by an admin through the admin-users edge function carry an invited role
    v_meta_role := new.raw_app_meta_data ->> 'invited_role';
    if v_meta_role in ('admin', 'treasurer', 'collector', 'auditor') then
      v_role := v_meta_role::public.app_role;
    end if;
  end if;

  perform set_config('app.allow_role_change', 'on', true);
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''), v_role);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function app_private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create or replace function app_private.notify_roles(
  p_roles public.app_role[], p_kind text, p_title_en text, p_title_bn text,
  p_body_en text, p_body_bn text, p_link text, p_dedupe text default null, p_exclude uuid default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, kind, title_en, title_bn, body_en, body_bn, link, dedupe_key)
  select p.id, p_kind, p_title_en, p_title_bn, p_body_en, p_body_bn, p_link,
         case when p_dedupe is null then null else p_dedupe end
  from public.profiles p
  where p.is_active and p.role = any (p_roles) and p.id is distinct from p_exclude
  on conflict (user_id, dedupe_key) do nothing;
$$;

create or replace function app_private.notify_user(
  p_user uuid, p_kind text, p_title_en text, p_title_bn text, p_body_en text, p_body_bn text, p_link text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, kind, title_en, title_bn, body_en, body_bn, link)
  values (p_user, p_kind, p_title_en, p_title_bn, p_body_en, p_body_bn, p_link);
$$;

create or replace function app_private.on_expense_insert_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.notify_roles(array['admin','treasurer']::public.app_role[], 'expense',
    'New expense awaiting approval', 'অনুমোদনের অপেক্ষায় নতুন খরচ',
    new.title || ' — ৳' || new.amount, new.title || ' — ৳' || new.amount, '/app/expenses', null, new.submitted_by);
  return new;
end $$;
create trigger trg_expenses_notify after insert on public.expenses for each row execute function app_private.on_expense_insert_notify();

create or replace function app_private.on_handover_insert_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.notify_roles(array['admin','treasurer']::public.app_role[], 'handover',
    'Cash handover submitted', 'নতুন ক্যাশ হ্যান্ডওভার',
    new.handover_no || ' — ৳' || new.amount, new.handover_no || ' — ৳' || new.amount, '/app/handovers', null, new.collector_id);
  return new;
end $$;
create trigger trg_handovers_notify after insert on public.handovers for each row execute function app_private.on_handover_insert_notify();

-- ---------------------------------------------------------------------------
-- Financial views (security_invoker: callers only see rows RLS allows)
-- ---------------------------------------------------------------------------

-- Students who owe dues in a month: joined before the month ended and
-- not archived before it began.
create or replace view public.v_student_month_status
with (security_invoker = on) as
select
  s.id as student_id,
  m.id as month_id,
  (m.contribution_amount + m.special_amount) as expected,
  coalesce(p.paid, 0) as paid,
  coalesce(w.waived, 0) as waived,
  greatest((m.contribution_amount + m.special_amount) - coalesce(p.paid, 0) - coalesce(w.waived, 0), 0) as remaining,
  case
    when (m.contribution_amount + m.special_amount) = 0 then 'paid'
    when coalesce(p.paid, 0) + coalesce(w.waived, 0) >= (m.contribution_amount + m.special_amount)
      then case when coalesce(p.paid, 0) = 0 then 'waived' else 'paid' end
    when coalesce(p.paid, 0) > 0 then 'partial'
    else 'unpaid'
  end as status
from public.fund_months m
join public.students s
  on s.joined_on <= (make_date(m.year, m.month, 1) + interval '1 month - 1 day')::date
 and (s.archived_at is null or (s.archived_at at time zone 'Asia/Dhaka')::date >= make_date(m.year, m.month, 1))
left join lateral (
  select sum(pa.amount) as paid from public.payments pa
  where pa.student_id = s.id and pa.month_id = m.id
) p on true
left join lateral (
  select sum(wa.amount) as waived from public.waivers wa
  where wa.student_id = s.id and wa.month_id = m.id and wa.revoked_at is null
) w on true;

-- Month-by-month ledger with carried-forward balances.
-- closing(n) = settings.opening_balance + Σ net(1..n);  opening(n) = closing(n) − net(n)
create or replace function app_private.month_ledger()
returns table (
  month_id uuid, year int, month int, title_en text, title_bn text, status public.month_status,
  contribution_amount bigint, special_amount bigint, special_label text, deadline date,
  students_due bigint, expected bigint, collected bigint, waived bigint, outstanding bigint,
  other_income bigint, expenses bigint, pending_expenses bigint,
  opening_balance bigint, closing_balance bigint,
  paid_count bigint, partial_count bigint, unpaid_count bigint, waived_count bigint,
  cash_collected bigint, digital_collected bigint
)
language sql stable security definer set search_path = ''
as $$
  with base as (
    select m.*,
      (select count(*) from public.v_student_month_status v where v.month_id = m.id) as students_due,
      (select coalesce(sum(v.expected), 0) from public.v_student_month_status v where v.month_id = m.id) as expected,
      (select coalesce(sum(v.waived), 0) from public.v_student_month_status v where v.month_id = m.id) as waived,
      (select coalesce(sum(v.remaining), 0) from public.v_student_month_status v where v.month_id = m.id) as outstanding,
      (select count(*) filter (where v.status = 'paid') from public.v_student_month_status v where v.month_id = m.id) as paid_count,
      (select count(*) filter (where v.status = 'partial') from public.v_student_month_status v where v.month_id = m.id) as partial_count,
      (select count(*) filter (where v.status = 'unpaid') from public.v_student_month_status v where v.month_id = m.id) as unpaid_count,
      (select count(*) filter (where v.status = 'waived') from public.v_student_month_status v where v.month_id = m.id) as waived_count,
      (select coalesce(sum(p.amount), 0) from public.payments p where p.month_id = m.id) as collected,
      (select coalesce(sum(p.amount), 0) from public.payments p where p.month_id = m.id and p.method = 'cash') as cash_collected,
      (select coalesce(sum(p.amount), 0) from public.payments p where p.month_id = m.id and p.method <> 'cash') as digital_collected,
      (select coalesce(sum(o.amount), 0) from public.other_income o where o.month_id = m.id and o.voided_at is null) as other_income,
      (select coalesce(sum(e.amount), 0) from public.expenses e where e.month_id = m.id and e.status = 'approved') as expenses,
      (select coalesce(sum(e.amount), 0) from public.expenses e where e.month_id = m.id and e.status = 'pending') as pending_expenses
    from public.fund_months m
  ), ordered as (
    select b.*,
      (select s.opening_balance from public.app_settings s)
        + sum(b.collected + b.other_income - b.expenses) over (order by b.year, b.month rows unbounded preceding) as closing_balance
    from base b
  )
  select o.id, o.year, o.month, o.title_en, o.title_bn, o.status,
    o.contribution_amount, o.special_amount, o.special_label, o.deadline,
    o.students_due, o.expected, o.collected, o.waived, o.outstanding,
    o.other_income, o.expenses, o.pending_expenses,
    (o.closing_balance - (o.collected + o.other_income - o.expenses))::bigint as opening_balance,
    o.closing_balance::bigint,
    o.paid_count, o.partial_count, o.unpaid_count, o.waived_count,
    o.cash_collected, o.digital_collected
  from ordered o
  order by o.year, o.month
$$;

-- Staff-facing wrapper (auditors, treasurers, admins and collectors may read class-level totals)
create or replace function public.get_month_ledger()
returns table (
  month_id uuid, year int, month int, title_en text, title_bn text, status public.month_status,
  contribution_amount bigint, special_amount bigint, special_label text, deadline date,
  students_due bigint, expected bigint, collected bigint, waived bigint, outstanding bigint,
  other_income bigint, expenses bigint, pending_expenses bigint,
  opening_balance bigint, closing_balance bigint,
  paid_count bigint, partial_count bigint, unpaid_count bigint, waived_count bigint,
  cash_collected bigint, digital_collected bigint
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform app_private.require_role(array['admin','treasurer','collector','auditor']::public.app_role[]);
  return query select * from app_private.month_ledger();
end $$;

-- Treasury position: overall balance split into cash and digital, and cash still with collectors
create or replace function public.get_treasury_position()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v jsonb;
begin
  perform app_private.require_role(array['admin','treasurer','auditor']::public.app_role[]);
  with t as (
    select
      (select opening_balance from public.app_settings) as opening,
      (select coalesce(sum(amount),0) from public.payments) as income,
      (select coalesce(sum(amount),0) from public.payments where method <> 'cash') as income_digital,
      (select coalesce(sum(amount),0) from public.other_income where voided_at is null) as other,
      (select coalesce(sum(amount),0) from public.other_income where voided_at is null and method <> 'cash') as other_digital,
      (select coalesce(sum(amount),0) from public.expenses where status = 'approved') as spent,
      (select coalesce(sum(amount),0) from public.expenses where status = 'approved' and payment_method <> 'cash') as spent_digital,
      (select coalesce(sum(amount),0) from public.expenses where status = 'pending') as pending_expenses,
      (select coalesce(sum(amount),0) from public.handovers where status = 'pending') as pending_handovers
  ), c as (
    select coalesce(sum(cash_in_hand), 0) as with_collectors from app_private.collector_cash()
  )
  select jsonb_build_object(
    'opening_balance', t.opening,
    'total_income', t.income + t.other,
    'collected', t.income,
    'other_income', t.other,
    'approved_expenses', t.spent,
    'pending_expenses', t.pending_expenses,
    'pending_handovers', t.pending_handovers,
    'balance', t.opening + t.income + t.other - t.spent,
    'digital_balance', t.income_digital + t.other_digital - t.spent_digital,
    'cash_balance', (t.opening + t.income + t.other - t.spent) - (t.income_digital + t.other_digital - t.spent_digital),
    'cash_with_collectors', c.with_collectors,
    'cash_with_treasury', (t.opening + t.income + t.other - t.spent) - (t.income_digital + t.other_digital - t.spent_digital) - c.with_collectors
  ) into v from t, c;
  return v;
end $$;
