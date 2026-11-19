-- Trusted business operations. Every write to money tables goes through these
-- SECURITY DEFINER functions, which check the caller's role from the database
-- (never from the client) and record a reason in the audit log.

create or replace function app_private.set_reason(p_reason text)
returns void language sql set search_path = '' as $$
  select set_config('app.audit_reason', coalesce(p_reason, ''), true);
$$;

create or replace function app_private.month_title(p_year int, p_month int, p_lang text)
returns text language sql immutable set search_path = '' as $$
  select case when p_lang = 'bn' then
    (array['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'])[p_month]
      || ' ' || translate(p_year::text, '0123456789', '০১২৩৪৫৬৭৮৯')
  else
    (array['January','February','March','April','May','June','July','August','September','October','November','December'])[p_month]
      || ' ' || p_year::text
  end
$$;

create or replace function app_private.assert_month_open(p_month uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
declare v public.month_status;
begin
  select status into v from public.fund_months where id = p_month;
  if v is null then raise exception 'Financial month not found' using errcode = 'P0002'; end if;
  if v = 'closed' then raise exception 'This month is closed' using errcode = 'P0001'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Collector cash
-- ---------------------------------------------------------------------------
create or replace function app_private.collector_cash()
returns table (collector_id uuid, cash_collected bigint, handed_confirmed bigint, handed_pending bigint, cash_in_hand bigint)
language sql stable security definer set search_path = '' as $$
  select p.id,
    coalesce((select sum(pa.amount) from public.payments pa where pa.collected_by = p.id and pa.method = 'cash'), 0)::bigint,
    coalesce((select sum(h.amount) from public.handovers h where h.collector_id = p.id and h.status = 'confirmed'), 0)::bigint,
    coalesce((select sum(h.amount) from public.handovers h where h.collector_id = p.id and h.status = 'pending'), 0)::bigint,
    (coalesce((select sum(pa.amount) from public.payments pa where pa.collected_by = p.id and pa.method = 'cash'), 0)
      - coalesce((select sum(h.amount) from public.handovers h where h.collector_id = p.id and h.status = 'confirmed'), 0))::bigint
  from public.profiles p
  where p.role = 'collector'
$$;

create or replace function public.get_collector_summaries()
returns table (collector_id uuid, full_name text, assigned_students bigint, cash_collected bigint,
               handed_confirmed bigint, handed_pending bigint, cash_in_hand bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app_private.require_role(array['admin','treasurer','auditor','collector']::public.app_role[]);
  return query
  select c.collector_id, p.full_name,
    (select count(*) from public.student_collector_assignments a where a.collector_id = c.collector_id and a.unassigned_at is null),
    c.cash_collected, c.handed_confirmed, c.handed_pending, c.cash_in_hand
  from app_private.collector_cash() c
  join public.profiles p on p.id = c.collector_id
  where public.my_role() <> 'collector' or c.collector_id = auth.uid()
  order by p.full_name;
end $$;

-- ---------------------------------------------------------------------------
-- Users & roles
-- ---------------------------------------------------------------------------
create or replace function public.set_user_role(p_user uuid, p_role public.app_role, p_active boolean, p_reason text default null)
returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare v public.profiles;
begin
  perform app_private.require_role(array['admin']::public.app_role[]);
  if p_user = auth.uid() then
    raise exception 'You cannot change your own role or status' using errcode = '42501';
  end if;
  select * into v from public.profiles where id = p_user for update;
  if v.id is null then raise exception 'User not found' using errcode = 'P0002'; end if;

  perform app_private.set_reason(p_reason);
  perform set_config('app.allow_role_change', 'on', true);

  -- a collector who loses the role gives up their students
  if v.role = 'collector' and (p_role <> 'collector' or not p_active) then
    update public.student_collector_assignments
       set unassigned_at = now(), unassigned_by = auth.uid()
     where collector_id = p_user and unassigned_at is null;
  end if;

  update public.profiles set role = p_role, is_active = p_active where id = p_user returning * into v;
  perform set_config('app.allow_role_change', 'off', true);
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Students → collector assignment
-- ---------------------------------------------------------------------------
create or replace function public.assign_students(p_collector uuid, p_students uuid[])
returns int
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  perform app_private.require_role(array['admin']::public.app_role[]);
  if p_collector is not null and not exists (
    select 1 from public.profiles where id = p_collector and role = 'collector' and is_active) then
    raise exception 'Selected user is not an active collector' using errcode = 'P0001';
  end if;

  update public.student_collector_assignments
     set unassigned_at = now(), unassigned_by = auth.uid()
   where student_id = any (p_students) and unassigned_at is null
     and (p_collector is null or collector_id <> p_collector);

  if p_collector is not null then
    insert into public.student_collector_assignments (student_id, collector_id, assigned_by)
    select s, p_collector, auth.uid() from unnest(p_students) s
    where not exists (select 1 from public.student_collector_assignments a
                      where a.student_id = s and a.unassigned_at is null);
  end if;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ---------------------------------------------------------------------------
-- Financial months
-- ---------------------------------------------------------------------------
create or replace function public.create_fund_month(
  p_year int, p_month int, p_contribution bigint, p_special bigint default 0,
  p_special_label text default null, p_deadline date default null, p_notes text default null)
returns public.fund_months
language plpgsql security definer set search_path = '' as $$
declare v public.fund_months;
begin
  perform app_private.require_role(array['admin']::public.app_role[]);
  insert into public.fund_months (year, month, title_en, title_bn, contribution_amount, special_amount,
                                  special_label, deadline, notes, created_by)
  values (p_year, p_month, app_private.month_title(p_year, p_month, 'en'), app_private.month_title(p_year, p_month, 'bn'),
          p_contribution, coalesce(p_special, 0), nullif(trim(p_special_label), ''), p_deadline, p_notes, auth.uid())
  returning * into v;

  perform app_private.notify_roles(array['admin','treasurer','collector','auditor']::public.app_role[], 'month',
    v.title_en || ' contribution set to ৳' || (v.contribution_amount + v.special_amount),
    v.title_bn || ' মাসের চাঁদা ৳' || (v.contribution_amount + v.special_amount), null, null, '/app/months/' || v.id,
    'month-' || v.id, auth.uid());
  return v;
exception when unique_violation then
  raise exception 'A financial month for %-% already exists', p_year, p_month using errcode = 'P0001';
end $$;

create or replace function public.update_fund_month(
  p_id uuid, p_contribution bigint, p_special bigint, p_special_label text, p_deadline date, p_notes text, p_reason text)
returns public.fund_months
language plpgsql security definer set search_path = '' as $$
declare v public.fund_months;
begin
  perform app_private.require_role(array['admin']::public.app_role[]);
  perform app_private.assert_month_open(p_id);
  perform app_private.set_reason(p_reason);
  update public.fund_months
     set contribution_amount = p_contribution, special_amount = coalesce(p_special, 0),
         special_label = nullif(trim(p_special_label), ''), deadline = p_deadline, notes = p_notes
   where id = p_id returning * into v;
  return v;
end $$;

create or replace function public.close_fund_month(p_id uuid, p_reason text default null)
returns public.fund_months
language plpgsql security definer set search_path = '' as $$
declare v public.fund_months; v_snap jsonb;
begin
  perform app_private.require_role(array['admin']::public.app_role[]);
  perform app_private.assert_month_open(p_id);
  if exists (select 1 from public.expenses where month_id = p_id and status = 'pending') then
    raise exception 'Approve or reject all pending expenses for this month before closing it' using errcode = 'P0001';
  end if;
  select to_jsonb(l) into v_snap from app_private.month_ledger() l where l.month_id = p_id;
  perform app_private.set_reason(p_reason);
  perform set_config('app.month_transition', 'on', true);
  update public.fund_months
     set status = 'closed', closed_at = now(), closed_by = auth.uid(), snapshot = v_snap
   where id = p_id returning * into v;
  perform set_config('app.month_transition', 'off', true);
  return v;
end $$;

create or replace function public.reopen_fund_month(p_id uuid, p_reason text)
returns public.fund_months
language plpgsql security definer set search_path = '' as $$
declare v public.fund_months;
begin
  perform app_private.require_role(array['admin']::public.app_role[]);
  if coalesce(length(trim(p_reason)), 0) < 5 then
    raise exception 'Please give a reason for reopening' using errcode = 'P0001';
  end if;
  perform app_private.set_reason(p_reason);
  perform set_config('app.month_transition', 'on', true);
  update public.fund_months set status = 'open', closed_at = null, closed_by = null
   where id = p_id and status = 'closed' returning * into v;
  perform set_config('app.month_transition', 'off', true);
  if v.id is null then raise exception 'Month is not closed' using errcode = 'P0001'; end if;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
create or replace function public.record_payment(
  p_student uuid, p_month uuid, p_amount bigint, p_method public.payment_method, p_paid_on date,
  p_transaction_ref text default null, p_note text default null, p_client_ref uuid default null)
returns public.payments
language plpgsql security definer set search_path = '' as $$
declare
  v public.payments;
  v_role public.app_role := public.my_role();
  v_remaining bigint;
  v_status public.student_status;
begin
  perform app_private.require_role(array['admin','treasurer','collector']::public.app_role[]);

  if p_client_ref is not null then
    select * into v from public.payments where client_ref = p_client_ref;
    if v.id is not null then return v; end if;   -- idempotent: a double-click returns the same receipt
  end if;

  if v_role = 'collector' and not public.is_my_student(p_student) then
    raise exception 'You can only record payments for students assigned to you' using errcode = '42501';
  end if;
  select status into v_status from public.students where id = p_student;
  if v_status is null then raise exception 'Student not found' using errcode = 'P0002'; end if;
  if v_status <> 'active' then raise exception 'Student is archived' using errcode = 'P0001'; end if;
  perform app_private.assert_month_open(p_month);
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be greater than zero' using errcode = 'P0001'; end if;
  if p_paid_on > app_private.dhaka_today() then raise exception 'Payment date cannot be in the future' using errcode = 'P0001'; end if;
  if p_method <> 'cash' and coalesce(trim(p_transaction_ref), '') = '' then
    raise exception 'A transaction reference is required for % payments', p_method using errcode = 'P0001';
  end if;

  -- serialise payments for the same student + month so two collectors can't overpay at once
  perform pg_advisory_xact_lock(hashtextextended(p_student::text || p_month::text, 0));
  select remaining into v_remaining from public.v_student_month_status where student_id = p_student and month_id = p_month;
  if v_remaining is null then
    raise exception 'This student has no dues for this month (joined later or archived)' using errcode = 'P0001';
  end if;
  if p_amount > v_remaining then
    raise exception 'Amount ৳% is more than the remaining due ৳%', p_amount, v_remaining using errcode = 'P0001';
  end if;

  insert into public.payments (receipt_no, student_id, month_id, amount, method, paid_on, collected_by,
                               transaction_ref, note, client_ref, created_by)
  values ('RCP-' || to_char(now() at time zone 'Asia/Dhaka', 'YYYY') || '-' || lpad(nextval('public.payment_receipt_seq')::text, 5, '0'),
          p_student, p_month, p_amount, p_method, p_paid_on, auth.uid(),
          nullif(trim(p_transaction_ref), ''), nullif(trim(p_note), ''), p_client_ref, auth.uid())
  returning * into v;
  return v;
end $$;

create or replace function public.reverse_payment(p_payment uuid, p_reason text)
returns public.payments
language plpgsql security definer set search_path = '' as $$
declare o public.payments; v public.payments;
begin
  perform app_private.require_role(array['admin','treasurer']::public.app_role[]);
  if coalesce(length(trim(p_reason)), 0) < 5 then
    raise exception 'Please give a reason for the reversal' using errcode = 'P0001';
  end if;
  select * into o from public.payments where id = p_payment for update;
  if o.id is null then raise exception 'Payment not found' using errcode = 'P0002'; end if;
  if o.reversal_of is not null then raise exception 'A reversal cannot be reversed' using errcode = 'P0001'; end if;
  if exists (select 1 from public.payments where reversal_of = o.id) then
    raise exception 'This payment has already been reversed' using errcode = 'P0001';
  end if;
  perform app_private.assert_month_open(o.month_id);
  perform app_private.set_reason(p_reason);
  insert into public.payments (receipt_no, student_id, month_id, amount, method, paid_on, collected_by,
                               transaction_ref, note, reversal_of, reversal_reason, created_by)
  values (o.receipt_no || '-R', o.student_id, o.month_id, -o.amount, o.method, app_private.dhaka_today(), o.collected_by,
          o.transaction_ref, 'Reversal of ' || o.receipt_no, o.id, trim(p_reason), auth.uid())
  returning * into v;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Waivers
-- ---------------------------------------------------------------------------
create or replace function public.grant_waiver(p_student uuid, p_month uuid, p_amount bigint, p_reason text)
returns public.waivers
language plpgsql security definer set search_path = '' as $$
declare v public.waivers; v_remaining bigint;
begin
  perform app_private.require_role(array['admin','treasurer']::public.app_role[]);
  perform app_private.assert_month_open(p_month);
  select remaining into v_remaining from public.v_student_month_status where student_id = p_student and month_id = p_month;
  if v_remaining is null then raise exception 'This student has no dues for this month' using errcode = 'P0001'; end if;
  if p_amount <= 0 or p_amount > v_remaining then
    raise exception 'Waiver must be between ৳1 and the remaining due ৳%', v_remaining using errcode = 'P0001';
  end if;
  perform app_private.set_reason(p_reason);
  insert into public.waivers (student_id, month_id, amount, reason, approved_by)
  values (p_student, p_month, p_amount, trim(p_reason), auth.uid()) returning * into v;
  return v;
exception when unique_violation then
  raise exception 'This student already has a waiver for this month. Revoke it first.' using errcode = 'P0001';
end $$;

create or replace function public.revoke_waiver(p_waiver uuid, p_reason text)
returns public.waivers
language plpgsql security definer set search_path = '' as $$
declare v public.waivers;
begin
  perform app_private.require_role(array['admin','treasurer']::public.app_role[]);
  select * into v from public.waivers where id = p_waiver and revoked_at is null for update;
  if v.id is null then raise exception 'Active waiver not found' using errcode = 'P0002'; end if;
  perform app_private.assert_month_open(v.month_id);
  perform app_private.set_reason(p_reason);
  update public.waivers set revoked_at = now(), revoked_by = auth.uid(), revoke_reason = trim(p_reason)
   where id = p_waiver returning * into v;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------
create or replace function public.decide_expense(p_expense uuid, p_approve boolean, p_reason text default null, p_allow_deficit boolean default false)
returns public.expenses
language plpgsql security definer set search_path = '' as $$
declare v public.expenses; v_balance bigint;
begin
  perform app_private.require_role(array['admin','treasurer']::public.app_role[]);
  select * into v from public.expenses where id = p_expense for update;
  if v.id is null then raise exception 'Expense not found' using errcode = 'P0002'; end if;
  if v.status <> 'pending' then raise exception 'This expense has already been decided' using errcode = 'P0001'; end if;
  if v.submitted_by = auth.uid() and p_approve then
    raise exception 'You cannot approve an expense you submitted' using errcode = '42501';
  end if;
  perform app_private.assert_month_open(v.month_id);
  if not p_approve and coalesce(length(trim(p_reason)), 0) < 3 then
    raise exception 'Please give a reason for rejecting' using errcode = 'P0001';
  end if;

  if p_approve then
    select (select opening_balance from public.app_settings)
         + (select coalesce(sum(amount),0) from public.payments)
         + (select coalesce(sum(amount),0) from public.other_income where voided_at is null)
         - (select coalesce(sum(amount),0) from public.expenses where status = 'approved')
      into v_balance;
    if v.amount > v_balance and not p_allow_deficit then
      raise exception 'DEFICIT: approving ৳% would exceed the fund balance ৳%', v.amount, v_balance using errcode = 'P0001';
    end if;
  end if;

  perform app_private.set_reason(coalesce(p_reason, case when p_allow_deficit then 'Approved with deficit authorisation' end));
  perform set_config('app.expense_decision', 'on', true);
  update public.expenses
     set status = case when p_approve then 'approved'::public.expense_status else 'rejected'::public.expense_status end,
         decided_by = auth.uid(), decided_at = now(),
         rejection_reason = case when p_approve then null else trim(p_reason) end
   where id = p_expense returning * into v;
  perform set_config('app.expense_decision', 'off', true);

  perform app_private.notify_user(v.submitted_by, 'expense',
    case when p_approve then 'Your expense was approved' else 'Your expense was rejected' end,
    case when p_approve then 'আপনার খরচ অনুমোদিত হয়েছে' else 'আপনার খরচ বাতিল হয়েছে' end,
    v.title || ' — ৳' || v.amount || coalesce(' · ' || v.rejection_reason, ''),
    v.title || ' — ৳' || v.amount || coalesce(' · ' || v.rejection_reason, ''), '/app/expenses');
  return v;
end $$;

create or replace function public.void_expense(p_expense uuid, p_reason text)
returns public.expenses
language plpgsql security definer set search_path = '' as $$
declare v public.expenses;
begin
  perform app_private.require_role(array['admin']::public.app_role[]);
  if coalesce(length(trim(p_reason)), 0) < 5 then raise exception 'Please give a reason' using errcode = 'P0001'; end if;
  select * into v from public.expenses where id = p_expense for update;
  if v.id is null then raise exception 'Expense not found' using errcode = 'P0002'; end if;
  if v.status not in ('approved', 'pending') then raise exception 'Only approved or pending expenses can be voided' using errcode = 'P0001'; end if;
  perform app_private.assert_month_open(v.month_id);
  perform app_private.set_reason(p_reason);
  perform set_config('app.expense_decision', 'on', true);
  update public.expenses set status = 'void', void_reason = trim(p_reason) where id = p_expense returning * into v;
  perform set_config('app.expense_decision', 'off', true);
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Handovers
-- ---------------------------------------------------------------------------
create or replace function public.submit_handover(
  p_amount bigint, p_method public.payment_method default 'cash', p_reference text default null,
  p_note text default null, p_client_ref uuid default null)
returns public.handovers
language plpgsql security definer set search_path = '' as $$
declare v public.handovers; v_available bigint;
begin
  perform app_private.require_role(array['collector']::public.app_role[]);
  if p_client_ref is not null then
    select * into v from public.handovers where client_ref = p_client_ref;
    if v.id is not null then return v; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('handover' || auth.uid()::text, 0));
  select cash_in_hand - handed_pending into v_available from app_private.collector_cash() where collector_id = auth.uid();
  if p_amount <= 0 or p_amount > coalesce(v_available, 0) then
    raise exception 'You can hand over at most ৳% (cash in hand minus pending handovers)', coalesce(v_available, 0) using errcode = 'P0001';
  end if;
  insert into public.handovers (handover_no, collector_id, amount, method, reference, note, client_ref)
  values ('HND-' || to_char(now() at time zone 'Asia/Dhaka', 'YYYY') || '-' || lpad(nextval('public.handover_no_seq')::text, 5, '0'),
          auth.uid(), p_amount, p_method, nullif(trim(p_reference), ''), nullif(trim(p_note), ''), p_client_ref)
  returning * into v;
  return v;
end $$;

create or replace function public.decide_handover(p_handover uuid, p_confirm boolean, p_reason text default null)
returns public.handovers
language plpgsql security definer set search_path = '' as $$
declare v public.handovers;
begin
  perform app_private.require_role(array['admin','treasurer']::public.app_role[]);
  select * into v from public.handovers where id = p_handover for update;
  if v.id is null then raise exception 'Handover not found' using errcode = 'P0002'; end if;
  if v.status <> 'pending' then raise exception 'This handover has already been processed' using errcode = 'P0001'; end if;
  if v.collector_id = auth.uid() then raise exception 'You cannot confirm your own handover' using errcode = '42501'; end if;
  if not p_confirm and coalesce(length(trim(p_reason)), 0) < 3 then
    raise exception 'Please give a reason for rejecting' using errcode = 'P0001';
  end if;
  perform app_private.set_reason(p_reason);
  update public.handovers
     set status = case when p_confirm then 'confirmed'::public.handover_status else 'rejected'::public.handover_status end,
         received_by = auth.uid(), decided_at = now(),
         reject_reason = case when p_confirm then null else trim(p_reason) end
   where id = p_handover returning * into v;
  perform app_private.notify_user(v.collector_id, 'handover',
    case when p_confirm then 'Handover confirmed' else 'Handover rejected' end,
    case when p_confirm then 'হ্যান্ডওভার নিশ্চিত হয়েছে' else 'হ্যান্ডওভার বাতিল হয়েছে' end,
    v.handover_no || ' — ৳' || v.amount, v.handover_no || ' — ৳' || v.amount, '/app/handovers');
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Other income
-- ---------------------------------------------------------------------------
create or replace function public.add_other_income(
  p_month uuid, p_source text, p_amount bigint, p_received_on date, p_method public.payment_method, p_note text default null)
returns public.other_income
language plpgsql security definer set search_path = '' as $$
declare v public.other_income;
begin
  perform app_private.require_role(array['admin','treasurer']::public.app_role[]);
  if not (select other_income_enabled from public.app_settings) then
    raise exception 'Other income is turned off in settings' using errcode = 'P0001';
  end if;
  perform app_private.assert_month_open(p_month);
  insert into public.other_income (month_id, source, amount, received_on, method, note, recorded_by)
  values (p_month, trim(p_source), p_amount, p_received_on, p_method, nullif(trim(p_note), ''), auth.uid())
  returning * into v;
  return v;
end $$;

create or replace function public.void_other_income(p_id uuid, p_reason text)
returns public.other_income
language plpgsql security definer set search_path = '' as $$
declare v public.other_income;
begin
  perform app_private.require_role(array['admin','treasurer']::public.app_role[]);
  select * into v from public.other_income where id = p_id and voided_at is null for update;
  if v.id is null then raise exception 'Entry not found' using errcode = 'P0002'; end if;
  perform app_private.assert_month_open(v.month_id);
  perform app_private.set_reason(p_reason);
  update public.other_income set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason)
   where id = p_id returning * into v;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
create or replace function public.update_settings(p jsonb, p_reason text default null)
returns public.app_settings
language plpgsql security definer set search_path = '' as $$
declare v public.app_settings;
begin
  perform app_private.require_role(array['admin']::public.app_role[]);
  select * into v from public.app_settings;
  if p ? 'opening_balance' and (p ->> 'opening_balance')::bigint <> v.opening_balance
     and coalesce(length(trim(p_reason)), 0) < 5 then
    raise exception 'Changing the opening balance needs a reason' using errcode = 'P0001';
  end if;
  perform app_private.set_reason(p_reason);
  update public.app_settings set
    app_name = coalesce(p ->> 'app_name', app_name),
    class_name = coalesce(p ->> 'class_name', class_name),
    opening_balance = coalesce((p ->> 'opening_balance')::bigint, opening_balance),
    opening_balance_note = coalesce(p ->> 'opening_balance_note', opening_balance_note),
    other_income_enabled = coalesce((p ->> 'other_income_enabled')::boolean, other_income_enabled),
    public_dashboard_enabled = coalesce((p ->> 'public_dashboard_enabled')::boolean, public_dashboard_enabled),
    public_show_expense_items = coalesce((p ->> 'public_show_expense_items')::boolean, public_show_expense_items),
    public_birthdays_enabled = coalesce((p ->> 'public_birthdays_enabled')::boolean, public_birthdays_enabled),
    max_collectors = coalesce((p ->> 'max_collectors')::int, max_collectors),
    updated_by = auth.uid(), updated_at = now()
  returning * into v;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Public, privacy-safe dashboard (callable without login)
-- ---------------------------------------------------------------------------
create or replace function public.get_public_dashboard()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  s public.app_settings;
  v jsonb;
  v_today date := app_private.dhaka_today();
begin
  select * into s from public.app_settings;
  if not s.public_dashboard_enabled then
    return jsonb_build_object('enabled', false, 'app_name', s.app_name, 'class_name', s.class_name);
  end if;

  select jsonb_build_object(
    'enabled', true,
    'app_name', s.app_name,
    'class_name', s.class_name,
    'generated_at', now(),
    'active_students', (select count(*) from public.students where status = 'active'),
    'months', coalesce((select jsonb_agg(jsonb_build_object(
        'id', l.month_id, 'year', l.year, 'month', l.month, 'title_en', l.title_en, 'title_bn', l.title_bn,
        'status', l.status, 'contribution', l.contribution_amount + l.special_amount,
        'special_label', l.special_label,
        'expected', l.expected, 'collected', l.collected, 'other_income', l.other_income,
        'expenses', l.expenses, 'opening_balance', l.opening_balance, 'closing_balance', l.closing_balance,
        'paid_count', l.paid_count, 'partial_count', l.partial_count, 'unpaid_count', l.unpaid_count,
        'waived_count', l.waived_count, 'students_due', l.students_due) order by l.year, l.month)
      from app_private.month_ledger() l), '[]'::jsonb),
    'totals', jsonb_build_object(
      'opening_balance', s.opening_balance,
      'collected', (select coalesce(sum(amount),0) from public.payments),
      'other_income', (select coalesce(sum(amount),0) from public.other_income where voided_at is null),
      'expenses', (select coalesce(sum(amount),0) from public.expenses where status = 'approved'),
      'balance', s.opening_balance
        + (select coalesce(sum(amount),0) from public.payments)
        + (select coalesce(sum(amount),0) from public.other_income where voided_at is null)
        - (select coalesce(sum(amount),0) from public.expenses where status = 'approved')),
    'categories', coalesce((select jsonb_agg(jsonb_build_object(
        'month_id', e.month_id, 'name_en', c.name_en, 'name_bn', c.name_bn, 'amount', e.total))
      from (select month_id, category_id, sum(amount) as total from public.expenses
            where status = 'approved' group by month_id, category_id) e
      join public.expense_categories c on c.id = e.category_id), '[]'::jsonb),
    'expenses', case when s.public_show_expense_items then coalesce((select jsonb_agg(jsonb_build_object(
        'id', e.id, 'month_id', e.month_id, 'title', e.title, 'amount', e.amount, 'spent_on', e.spent_on,
        'category_en', c.name_en, 'category_bn', c.name_bn) order by e.spent_on desc)
      from public.expenses e join public.expense_categories c on c.id = e.category_id
      where e.status = 'approved'), '[]'::jsonb) else null end,
    'birthdays_today', case when s.public_birthdays_enabled then coalesce((select jsonb_agg(st.name order by st.name)
      from public.students st
      where st.status = 'active' and st.birthdate is not null
        and to_char(st.birthdate, 'MM-DD') = to_char(v_today, 'MM-DD')), '[]'::jsonb) else null end
  ) into v;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Daily birthday notifications for staff (scheduled with pg_cron)
-- ---------------------------------------------------------------------------
create or replace function app_private.send_birthday_notifications()
returns void language plpgsql security definer set search_path = '' as $$
declare r record; v_today date := app_private.dhaka_today();
begin
  for r in
    select st.id, st.name, st.roll from public.students st
    where st.status = 'active' and st.birthdate is not null
      and (to_char(st.birthdate, 'MM-DD') = to_char(v_today, 'MM-DD')
           -- 29 Feb birthdays are celebrated on 28 Feb in non-leap years
           or (to_char(st.birthdate, 'MM-DD') = '02-29' and to_char(v_today, 'MM-DD') = '02-28'
               and extract(day from (date_trunc('year', v_today) + interval '2 month - 1 day')) = 28))
  loop
    perform app_private.notify_roles(array['admin','treasurer','auditor']::public.app_role[], 'birthday',
      'Birthday today: ' || r.name, 'আজ জন্মদিন: ' || r.name, 'Roll ' || r.roll, 'রোল ' || r.roll,
      '/app/birthdays', 'bday-' || r.id || '-' || v_today);
    -- the student's own collector is told too
    insert into public.notifications (user_id, kind, title_en, title_bn, body_en, body_bn, link, dedupe_key)
    select a.collector_id, 'birthday', 'Birthday today: ' || r.name, 'আজ জন্মদিন: ' || r.name,
           'Roll ' || r.roll, 'রোল ' || r.roll, '/app/birthdays', 'bday-' || r.id || '-' || v_today
    from public.student_collector_assignments a
    where a.student_id = r.id and a.unassigned_at is null
    on conflict (user_id, dedupe_key) do nothing;
  end loop;
end $$;
