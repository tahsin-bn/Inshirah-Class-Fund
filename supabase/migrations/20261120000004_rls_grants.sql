-- Row Level Security, privileges, storage and scheduled jobs.
-- Principle: the browser may READ what its role allows; money tables are
-- WRITTEN only by the SECURITY DEFINER functions in the previous migration.

-- ---------------------------------------------------------------------------
-- Lock everything down, then grant precisely
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema app_private from public, anon, authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['app_settings','profiles','students','student_collector_assignments','fund_months',
                           'payments','waivers','expense_categories','expenses','other_income','handovers',
                           'notifications','audit_logs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- Read access for signed-in users (rows filtered by policies below)
grant select on public.app_settings, public.profiles, public.students, public.student_collector_assignments,
  public.fund_months, public.payments, public.waivers, public.expense_categories, public.expenses,
  public.other_income, public.handovers, public.notifications, public.audit_logs to authenticated;
grant select on public.v_student_month_status to authenticated;

-- Narrow write access
grant update (full_name, phone) on public.profiles to authenticated;
grant insert (roll, name, phone, email, birthdate, class_name, group_name, notes, joined_on, legacy_id) on public.students to authenticated;
grant update (roll, name, phone, email, birthdate, class_name, group_name, notes, status, archived_at, joined_on) on public.students to authenticated;
grant insert (name_en, name_bn, sort_order, is_active) on public.expense_categories to authenticated;
grant update (name_en, name_bn, sort_order, is_active) on public.expense_categories to authenticated;
grant insert (title, category_id, month_id, amount, spent_on, description, payment_method, receipt_path) on public.expenses to authenticated;
grant update (title, category_id, month_id, amount, spent_on, description, payment_method, receipt_path) on public.expenses to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Functions callable from the app
grant execute on function public.my_role(), public.has_role(public.app_role[]), public.is_staff(), public.is_my_student(uuid) to authenticated;
grant execute on function
  public.get_month_ledger(), public.get_treasury_position(), public.get_collector_summaries(),
  public.set_user_role(uuid, public.app_role, boolean, text),
  public.assign_students(uuid, uuid[]),
  public.create_fund_month(int, int, bigint, bigint, text, date, text),
  public.update_fund_month(uuid, bigint, bigint, text, date, text, text),
  public.close_fund_month(uuid, text), public.reopen_fund_month(uuid, text),
  public.record_payment(uuid, uuid, bigint, public.payment_method, date, text, text, uuid),
  public.reverse_payment(uuid, text),
  public.grant_waiver(uuid, uuid, bigint, text), public.revoke_waiver(uuid, text),
  public.decide_expense(uuid, boolean, text, boolean), public.void_expense(uuid, text),
  public.submit_handover(bigint, public.payment_method, text, text, uuid),
  public.decide_handover(uuid, boolean, text),
  public.add_other_income(uuid, text, bigint, date, public.payment_method, text),
  public.void_other_income(uuid, text),
  public.update_settings(jsonb, text)
to authenticated;
grant execute on function public.get_public_dashboard() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
-- settings: any staff member
create policy settings_read on public.app_settings for select to authenticated using (public.is_staff());

-- profiles: everyone sees their own; staff see each other (names for "received by", "collector")
create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_staff());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- students: admin/treasurer/auditor see all; collectors see only assigned
create policy students_read on public.students for select to authenticated
  using (public.has_role(array['admin','treasurer','auditor']::public.app_role[]) or public.is_my_student(id));
create policy students_insert on public.students for insert to authenticated
  with check (public.has_role(array['admin']::public.app_role[]));
create policy students_update on public.students for update to authenticated
  using (public.has_role(array['admin']::public.app_role[]))
  with check (public.has_role(array['admin']::public.app_role[]));

create policy sca_read on public.student_collector_assignments for select to authenticated
  using (public.has_role(array['admin','treasurer','auditor']::public.app_role[]) or collector_id = (select auth.uid()));

-- months: all staff
create policy months_read on public.fund_months for select to authenticated using (public.is_staff());

-- payments & waivers: managers see all; collectors see their students' rows and rows they collected
create policy payments_read on public.payments for select to authenticated
  using (public.has_role(array['admin','treasurer','auditor']::public.app_role[])
         or collected_by = (select auth.uid()) or public.is_my_student(student_id));
create policy waivers_read on public.waivers for select to authenticated
  using (public.has_role(array['admin','treasurer','auditor']::public.app_role[]) or public.is_my_student(student_id));

-- expense categories
create policy categories_read on public.expense_categories for select to authenticated using (public.is_staff());
create policy categories_insert on public.expense_categories for insert to authenticated
  with check (public.has_role(array['admin']::public.app_role[]));
create policy categories_update on public.expense_categories for update to authenticated
  using (public.has_role(array['admin']::public.app_role[])) with check (public.has_role(array['admin']::public.app_role[]));

-- expenses: managers see all; collectors see approved ones and their own
create policy expenses_read on public.expenses for select to authenticated
  using (public.has_role(array['admin','treasurer','auditor']::public.app_role[])
         or (public.my_role() = 'collector' and (status = 'approved' or submitted_by = (select auth.uid()))));
create policy expenses_insert on public.expenses for insert to authenticated
  with check (public.has_role(array['admin','treasurer','collector']::public.app_role[]));
create policy expenses_update_own_pending on public.expenses for update to authenticated
  using (submitted_by = (select auth.uid()) and status = 'pending')
  with check (submitted_by = (select auth.uid()) and status = 'pending');

-- other income: managers
create policy other_income_read on public.other_income for select to authenticated
  using (public.has_role(array['admin','treasurer','auditor']::public.app_role[]));

-- handovers: managers see all; collectors their own
create policy handovers_read on public.handovers for select to authenticated
  using (public.has_role(array['admin','treasurer','auditor']::public.app_role[]) or collector_id = (select auth.uid()));

-- notifications: own
create policy notifications_read on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- audit log: admin, treasurer, auditor (read-only for everyone)
create policy audit_read on public.audit_logs for select to authenticated
  using (public.has_role(array['admin','treasurer','auditor']::public.app_role[]));

-- ---------------------------------------------------------------------------
-- Receipt storage (private bucket). Files live under <uploader uid>/<sha256>.<ext>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 2097152, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

create policy receipts_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts'
              and public.has_role(array['admin','treasurer','collector']::public.app_role[])
              and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy receipts_read on storage.objects for select to authenticated
  using (bucket_id = 'receipts'
         and (public.has_role(array['admin','treasurer','auditor']::public.app_role[])
              or (storage.foldername(name))[1] = (select auth.uid())::text));

-- ---------------------------------------------------------------------------
-- Daily birthday notifications at 00:05 Asia/Dhaka (18:05 UTC)
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;
select cron.schedule('birthday-notifications', '5 18 * * *', $$select app_private.send_birthday_notifications()$$);
