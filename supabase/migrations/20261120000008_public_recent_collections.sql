-- Public dashboard: add daily collection totals for the "recent activity" list.
-- Only per-day sums are exposed; who paid stays private.
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
    -- daily collection totals only (no names, rolls or receipts) for the activity feed
    'recent_collections', coalesce((select jsonb_agg(jsonb_build_object('day', d.paid_on, 'amount', d.total, 'last_at', d.last_at) order by d.paid_on desc)
      from (select paid_on, sum(amount) as total, max(created_at) as last_at from public.payments
            group by paid_on having sum(amount) <> 0 order by paid_on desc limit 8) d), '[]'::jsonb),
    'today', v_today
  ) into v;
  return v;
end $$;

revoke execute on function public.get_public_dashboard() from public;
grant execute on function public.get_public_dashboard() to anon, authenticated;
