-- Removes everything created by security_smoke_test.sql (run as postgres).
do $$
declare ids uuid[] := array[
  '00000000-0000-4000-a000-00000000000a','00000000-0000-4000-a000-00000000000b',
  '00000000-0000-4000-a000-0000000000c1','00000000-0000-4000-a000-0000000000c2',
  '00000000-0000-4000-a000-0000000000a0','00000000-0000-4000-a000-0000000000ee']::uuid[];
begin
  delete from public.notifications where user_id = any (ids);
  delete from public.payments where reversal_of is not null and created_by = any (ids);
  delete from public.payments where created_by = any (ids);
  delete from public.waivers where approved_by = any (ids);
  delete from public.handovers where collector_id = any (ids);
  delete from public.expenses where submitted_by = any (ids);
  delete from public.student_collector_assignments where collector_id = any (ids);
  delete from public.students where created_by = any (ids) or roll like 'T-%';
  delete from public.fund_months where year = 2099;
  delete from auth.users where id = any (ids);
  delete from public.audit_logs where actor_id = any (ids) or actor_id is null and table_name in ('payments','waivers','handovers','expenses','student_collector_assignments','students','fund_months','profiles');
end $$;
alter sequence public.payment_receipt_seq restart with 1;
alter sequence public.expense_no_seq restart with 1;
alter sequence public.handover_no_seq restart with 1;
drop schema tests cascade;
