-- Typed totals in the status view, automatic student bookkeeping columns.

-- column types change (numeric → bigint), so the view is recreated; it holds no data
drop view public.v_student_month_status;
create view public.v_student_month_status
with (security_invoker = on) as
select
  s.id as student_id,
  m.id as month_id,
  (m.contribution_amount + m.special_amount)::bigint as expected,
  coalesce(p.paid, 0)::bigint as paid,
  coalesce(w.waived, 0)::bigint as waived,
  greatest((m.contribution_amount + m.special_amount) - coalesce(p.paid, 0) - coalesce(w.waived, 0), 0)::bigint as remaining,
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

grant select on public.v_student_month_status to authenticated;

create or replace function app_private.prepare_student()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.roll := trim(new.roll);
  new.name := trim(new.name);
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  end if;
  if new.status = 'archived' and new.archived_at is null then
    new.archived_at := now();
  elsif new.status = 'active' then
    new.archived_at := null;
  end if;
  return new;
end $$;
create trigger trg_students_prepare before insert or update on public.students
  for each row execute function app_private.prepare_student();
