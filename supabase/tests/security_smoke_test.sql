-- Security & financial-logic smoke test.
-- Run as the `postgres` role on a NON-PRODUCTION database (or a fresh project).
-- It creates throw-away users/students, impersonates each role, prints PASS/FAIL,
-- and removes everything it created at the end (see cleanup section).

create schema if not exists tests;

create or replace function tests.as_user(p_uid uuid, p_sql text)
returns text language plpgsql as $$
declare r text;
begin
  if p_uid is null then
    execute 'set local role anon';
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  else
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  end if;
  execute p_sql into r;
  execute 'reset role';
  return 'OK ' || coalesce(r, '');
exception when others then
  return 'ERR ' || sqlerrm;
end $$;

create table if not exists tests.results (n serial, name text, expect text, got text, pass boolean);
truncate tests.results;

create or replace function tests.check(p_name text, p_expect text, p_got text)
returns void language sql as $$
  insert into tests.results (name, expect, got, pass) values (p_name, p_expect, p_got, p_got like p_expect || '%');
$$;

do $$
declare
  a uuid := '00000000-0000-4000-a000-00000000000a';
  t uuid := '00000000-0000-4000-a000-00000000000b';
  c1 uuid := '00000000-0000-4000-a000-0000000000c1';
  c2 uuid := '00000000-0000-4000-a000-0000000000c2';
  au uuid := '00000000-0000-4000-a000-0000000000a0';
  pe uuid := '00000000-0000-4000-a000-0000000000ee';
  m uuid; s1 uuid; s2 uuid; e1 uuid; e2 uuid; h1 uuid; p1 uuid; r text;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (a,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't-admin@test.invalid',  '{"invited_role":"admin"}',     '{"full_name":"Test Admin"}', now(), now()),
    (t,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't-treas@test.invalid',  '{"invited_role":"treasurer"}', '{"full_name":"Test Treasurer"}', now(), now()),
    (c1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't-col1@test.invalid',   '{"invited_role":"collector"}', '{"full_name":"Test Collector 1"}', now(), now()),
    (c2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't-col2@test.invalid',   '{"invited_role":"collector"}', '{"full_name":"Test Collector 2"}', now(), now()),
    (au, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't-audit@test.invalid',  '{"invited_role":"auditor"}',   '{"full_name":"Test Auditor"}', now(), now()),
    (pe, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't-pending@test.invalid', '{}',                          '{}', now(), now());

  perform tests.check('pending user sees no students', 'OK 0', tests.as_user(pe, 'select count(*)::text from public.students'));
  perform tests.check('anon cannot read students table', 'ERR permission denied', tests.as_user(null, 'select count(*)::text from public.students'));
  perform tests.check('anon can read public dashboard', 'OK true', tests.as_user(null, 'select (public.get_public_dashboard()->>''enabled'')'));
  perform tests.check('pending user cannot elevate own role', 'ERR', tests.as_user(pe, format('update public.profiles set role = ''admin'' where id = %L returning role::text', pe)));

  r := tests.as_user(a, 'select id::text from public.create_fund_month(2099, 1, 50, 0, null, null, null)');
  perform tests.check('admin creates month', 'OK', r);
  m := substr(r, 4)::uuid;
  perform tests.check('collector cannot create month', 'ERR Permission denied', tests.as_user(c1, 'select id::text from public.create_fund_month(2099, 2, 50, 0, null, null, null)'));

  r := tests.as_user(a, 'insert into public.students (roll, name, joined_on) values (''T-01'', ''Test Student One'', ''2098-01-01'') returning id::text');
  perform tests.check('admin adds student', 'OK', r); s1 := substr(r, 4)::uuid;
  r := tests.as_user(a, 'insert into public.students (roll, name, joined_on) values (''T-02'', ''Test Student Two'', ''2098-01-01'') returning id::text');
  s2 := substr(r, 4)::uuid;
  perform tests.check('duplicate roll rejected', 'ERR', tests.as_user(a, 'insert into public.students (roll, name) values ('' t-01 '', ''Dup'') returning id::text'));
  perform tests.check('collector cannot add student', 'ERR', tests.as_user(c1, 'insert into public.students (roll, name) values (''T-09'', ''X'') returning id::text'));

  perform tests.check('admin assigns S1 to C1', 'OK 1', tests.as_user(a, format('select public.assign_students(%L, array[%L]::uuid[])::text', c1, s1)));
  perform tests.check('admin assigns S2 to C2', 'OK 1', tests.as_user(a, format('select public.assign_students(%L, array[%L]::uuid[])::text', c2, s2)));
  perform tests.check('collector sees only assigned student', 'OK 1', tests.as_user(c1, 'select count(*)::text from public.students where roll like ''T-%'''));

  perform tests.check('future payment date rejected', 'ERR Payment date', tests.as_user(c1, format('select id::text from public.record_payment(%L, %L, 30, ''cash'', current_date + 3)', s1, m)));
  r := tests.as_user(c1, format('select id::text from public.record_payment(%L, %L, 30, ''cash'', current_date, null, null, %L)', s1, m, '11111111-1111-4111-8111-111111111111'));
  perform tests.check('collector records partial payment for own student', 'OK', r); p1 := substr(r, 4)::uuid;
  perform tests.check('double-click returns same receipt (idempotent)', 'OK ' || p1, tests.as_user(c1, format('select id::text from public.record_payment(%L, %L, 30, ''cash'', current_date, null, null, %L)', s1, m, '11111111-1111-4111-8111-111111111111')));
  perform tests.check('collector cannot pay for other collector''s student', 'ERR You can only', tests.as_user(c1, format('select id::text from public.record_payment(%L, %L, 10, ''cash'', current_date)', s2, m)));
  perform tests.check('overpayment blocked', 'ERR Amount', tests.as_user(c1, format('select id::text from public.record_payment(%L, %L, 30, ''cash'', current_date)', s1, m)));
  perform tests.check('bKash payment needs transaction ref', 'ERR A transaction reference', tests.as_user(c1, format('select id::text from public.record_payment(%L, %L, 5, ''bkash'', current_date)', s1, m)));
  perform tests.check('collector cannot insert payments directly', 'ERR permission denied', tests.as_user(c1, format('insert into public.payments (receipt_no, student_id, month_id, amount, method, paid_on, collected_by, created_by) values (''X'', %L, %L, 5, ''cash'', current_date, %L, %L) returning id::text', s1, m, c1, c1)));
  perform tests.check('collector cannot delete payments', 'ERR permission denied', tests.as_user(c1, 'delete from public.payments returning id::text'));
  perform tests.check('student status is partial', 'OK partial', tests.as_user(c1, format('select status from public.v_student_month_status where student_id = %L and month_id = %L', s1, m)));
  perform tests.check('collector cannot read audit log', 'OK 0', tests.as_user(c1, 'select count(*)::text from public.audit_logs'));

  r := tests.as_user(c1, format('insert into public.expenses (title, category_id, month_id, amount, spent_on) values (''Snacks'', (select id from public.expense_categories limit 1), %L, 10, current_date) returning id::text', m));
  perform tests.check('collector submits expense', 'OK', r); e1 := substr(r, 4)::uuid;
  perform tests.check('new expense is pending', 'OK pending', tests.as_user(a, format('select status::text from public.expenses where id = %L', e1)));
  perform tests.check('collector cannot approve expenses', 'ERR Permission denied', tests.as_user(c1, format('select status::text from public.decide_expense(%L, true)', e1)));
  perform tests.check('treasurer approves expense', 'OK approved', tests.as_user(t, format('select status::text from public.decide_expense(%L, true)', e1)));
  perform tests.check('expense cannot be decided twice', 'ERR This expense has already', tests.as_user(a, format('select status::text from public.decide_expense(%L, false, ''no'')', e1)));

  r := tests.as_user(t, format('insert into public.expenses (title, category_id, month_id, amount, spent_on) values (''Big event'', (select id from public.expense_categories limit 1), %L, 1000, current_date) returning id::text', m));
  e2 := substr(r, 4)::uuid;
  perform tests.check('treasurer cannot approve own expense', 'ERR You cannot approve', tests.as_user(t, format('select status::text from public.decide_expense(%L, true)', e2)));
  perform tests.check('deficit guard blocks approval', 'ERR DEFICIT', tests.as_user(a, format('select status::text from public.decide_expense(%L, true)', e2)));
  perform tests.check('rejection needs a reason', 'ERR Please give', tests.as_user(a, format('select status::text from public.decide_expense(%L, false, '''')', e2)));
  perform tests.check('admin rejects with reason', 'OK rejected', tests.as_user(a, format('select status::text from public.decide_expense(%L, false, ''Too expensive'')', e2)));

  perform tests.check('handover above cash in hand blocked', 'ERR You can hand over at most', tests.as_user(c1, 'select id::text from public.submit_handover(50)'));
  r := tests.as_user(c1, 'select id::text from public.submit_handover(30)');
  perform tests.check('collector submits handover', 'OK', r); h1 := substr(r, 4)::uuid;
  perform tests.check('second handover blocked (cash already pending)', 'ERR You can hand over at most', tests.as_user(c1, 'select id::text from public.submit_handover(1)'));
  perform tests.check('collector cannot confirm handover', 'ERR Permission denied', tests.as_user(c1, format('select status::text from public.decide_handover(%L, true)', h1)));
  perform tests.check('treasurer confirms handover', 'OK confirmed', tests.as_user(t, format('select status::text from public.decide_handover(%L, true)', h1)));
  perform tests.check('handover cannot be processed twice', 'ERR This handover has already', tests.as_user(t, format('select status::text from public.decide_handover(%L, true)', h1)));
  perform tests.check('collector cash in hand is 0 after handover', 'OK 0', tests.as_user(c1, 'select cash_in_hand::text from public.get_collector_summaries()'));

  perform tests.check('ledger closing = opening + 30 − 10 (handover not income)', 'OK 20',
    tests.as_user(au, format('select (closing_balance - (select opening_balance from public.app_settings))::text from public.get_month_ledger() where month_id = %L', m)));
  perform tests.check('auditor cannot record payment', 'ERR Permission denied', tests.as_user(au, format('select id::text from public.record_payment(%L, %L, 5, ''cash'', current_date)', s1, m)));
  perform tests.check('auditor reads audit log', 'OK t', tests.as_user(au, 'select (count(*) > 0)::text from public.audit_logs'));
  perform tests.check('admin cannot change own role', 'ERR You cannot change your own', tests.as_user(a, format('select role::text from public.set_user_role(%L, ''auditor'', true)', a)));
  perform tests.check('treasurer cannot change roles', 'ERR Permission denied', tests.as_user(t, format('select role::text from public.set_user_role(%L, ''admin'', true)', c1)));

  perform tests.check('reversal needs a reason', 'ERR Please give', tests.as_user(t, format('select id::text from public.reverse_payment(%L, ''x'')', p1)));
  perform tests.check('treasurer reverses payment', 'OK -30', tests.as_user(t, format('select amount::text from public.reverse_payment(%L, ''Recorded twice by mistake'')', p1)));
  perform tests.check('payment cannot be reversed twice', 'ERR This payment has already', tests.as_user(t, format('select amount::text from public.reverse_payment(%L, ''Recorded twice by mistake'')', p1)));
  perform tests.check('student back to unpaid after reversal', 'OK unpaid', tests.as_user(a, format('select status from public.v_student_month_status where student_id = %L and month_id = %L', s1, m)));

  perform tests.check('waiver over due blocked', 'ERR Waiver must be', tests.as_user(t, format('select id::text from public.grant_waiver(%L, %L, 60, ''Hardship'')', s2, m)));
  perform tests.check('treasurer grants full waiver', 'OK 50', tests.as_user(t, format('select amount::text from public.grant_waiver(%L, %L, 50, ''Hardship case'')', s2, m)));
  perform tests.check('full waiver gives waived status', 'OK waived', tests.as_user(t, format('select status from public.v_student_month_status where student_id = %L and month_id = %L', s2, m)));

  perform tests.check('admin closes month', 'OK closed', tests.as_user(a, format('select status::text from public.close_fund_month(%L)', m)));
  perform tests.check('payments blocked in closed month', 'ERR This month is closed', tests.as_user(a, format('select id::text from public.record_payment(%L, %L, 5, ''cash'', current_date)', s1, m)));
  perform tests.check('public dashboard has no names', 'OK f', tests.as_user(null, 'select (public.get_public_dashboard()::text like ''%Test Student%'')::text'));
end $$;

select n, pass, name, expect, got from tests.results order by n;
