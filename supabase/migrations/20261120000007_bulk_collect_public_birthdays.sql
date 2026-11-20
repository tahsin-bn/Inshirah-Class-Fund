-- Bulk collection (admin only) and richer, still privacy-safe, public birthdays.

-- ---------------------------------------------------------------------------
-- record_bulk_payments: collect the full remaining due for many students in
-- one month, in one transaction. Admin only. Every row goes through
-- record_payment, so all the usual checks (open month, no overpayment,
-- transaction reference for non-cash) still apply. Idempotent: the same
-- p_client_ref sent twice returns without creating duplicate receipts.
-- ---------------------------------------------------------------------------
create or replace function public.record_bulk_payments(
  p_month uuid, p_students uuid[], p_method public.payment_method, p_paid_on date,
  p_client_ref uuid, p_transaction_ref text default null, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s uuid;
  v_ref uuid;
  v_remaining bigint;
  v_status public.student_status;
  p public.payments;
  n int := 0; v_total bigint := 0; v_skipped int := 0; v_already int := 0;
  v_receipts jsonb := '[]'::jsonb;
begin
  perform app_private.require_role(array['admin']::public.app_role[]);
  if p_client_ref is null then raise exception 'Missing request id' using errcode = 'P0001'; end if;
  if coalesce(cardinality(p_students), 0) = 0 then
    raise exception 'Select at least one student' using errcode = 'P0001';
  end if;
  if cardinality(p_students) > 500 then
    raise exception 'Too many students in one go (max 500)' using errcode = 'P0001';
  end if;
  perform app_private.assert_month_open(p_month);

  for s in select distinct x from unnest(p_students) as x loop
    v_ref := md5(p_client_ref::text || ':' || s::text)::uuid;
    if exists (select 1 from public.payments where client_ref = v_ref) then
      v_already := v_already + 1;
      continue;
    end if;
    select status into v_status from public.students where id = s;
    if v_status is distinct from 'active' then v_skipped := v_skipped + 1; continue; end if;

    perform pg_advisory_xact_lock(hashtextextended(s::text || p_month::text, 0));
    select remaining into v_remaining from public.v_student_month_status where student_id = s and month_id = p_month;
    if coalesce(v_remaining, 0) <= 0 then v_skipped := v_skipped + 1; continue; end if;

    p := public.record_payment(s, p_month, v_remaining, p_method, p_paid_on, p_transaction_ref,
                               coalesce(nullif(trim(p_note), ''), 'Bulk collection'), v_ref);
    n := n + 1;
    v_total := v_total + p.amount;
    v_receipts := v_receipts || jsonb_build_object('receipt_no', p.receipt_no, 'student_id', s, 'amount', p.amount);
  end loop;

  return jsonb_build_object('count', n, 'total', v_total, 'skipped', v_skipped,
                            'already_recorded', v_already, 'receipts', v_receipts);
end $$;

revoke execute on function public.record_bulk_payments(uuid, uuid[], public.payment_method, date, uuid, text, text) from public, anon;
grant execute on function public.record_bulk_payments(uuid, uuid[], public.payment_method, date, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Public dashboard: add this month's birthdays (name + day only) when the
-- admin has turned public birthdays on.
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
        and to_char(st.birthdate, 'MM-DD') = to_char(v_today, 'MM-DD')), '[]'::jsonb) else null end,
    -- this month's birthdays: name and day only (never the year, age, roll or full date)
    'birthdays_month', case when s.public_birthdays_enabled then coalesce((select jsonb_agg(jsonb_build_object(
        'name', st.name, 'day', extract(day from st.birthdate)::int) order by extract(day from st.birthdate), st.name)
      from public.students st
      where st.status = 'active' and st.birthdate is not null
        and extract(month from st.birthdate) = extract(month from v_today)), '[]'::jsonb) else null end,
    'today', v_today
  ) into v;
  return v;
end $$;

revoke execute on function public.get_public_dashboard() from public;
grant execute on function public.get_public_dashboard() to anon, authenticated;
