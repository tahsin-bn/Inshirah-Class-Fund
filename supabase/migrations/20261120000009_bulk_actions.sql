-- Bulk actions for every list. "Delete" is always the safe kind:
--   payments  -> reversal entries (history kept)
--   expenses  -> void (history kept)
--   students  -> archived if they have any money record; permanently removed only if they have none
--   months    -> permanently removed only when nothing is recorded against them
-- Every function runs in one transaction, re-uses the single-row RPC where one exists
-- (so all existing rules still apply), skips rows it must not touch, and reports counts.

-- Payments: reverse many ------------------------------------------------------
create or replace function public.bulk_reverse_payments(p_ids uuid[], p_reason text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r record; n int := 0; v_total bigint := 0; skipped int := 0;
begin
  perform app_private.require_role(array['admin','treasurer']::public.app_role[]);
  if coalesce(length(trim(p_reason)), 0) < 5 then raise exception 'Please give a reason for the reversal' using errcode = 'P0001'; end if;
  if coalesce(cardinality(p_ids), 0) = 0 then raise exception 'Select at least one payment' using errcode = 'P0001'; end if;
  if cardinality(p_ids) > 500 then raise exception 'Too many rows in one go (max 500)' using errcode = 'P0001'; end if;

  for r in
    select p.id, p.amount, p.reversal_of, m.status as month_status,
           exists (select 1 from public.payments x where x.reversal_of = p.id) as already
      from public.payments p join public.fund_months m on m.id = p.month_id
     where p.id = any (p_ids)
     order by p.created_at
  loop
    if r.reversal_of is not null or r.already or r.month_status <> 'open' then
      skipped := skipped + 1; continue;
    end if;
    perform public.reverse_payment(r.id, p_reason);
    n := n + 1; v_total := v_total + r.amount;
  end loop;
  return jsonb_build_object('done', n, 'total', v_total, 'skipped', skipped);
end $$;

-- Students: archive (has money) or delete (has nothing) -----------------------
create or replace function public.bulk_remove_students(p_ids uuid[], p_reason text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s record; archived int := 0; deleted int := 0; skipped int := 0;
begin
  perform app_private.require_role(array['admin']::public.app_role[]);
  if coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'Please give a reason' using errcode = 'P0001'; end if;
  if coalesce(cardinality(p_ids), 0) = 0 then raise exception 'Select at least one student' using errcode = 'P0001'; end if;
  perform app_private.set_reason(p_reason);

  for s in
    select st.id, st.status,
           exists (select 1 from public.payments p where p.student_id = st.id)
        or exists (select 1 from public.waivers w where w.student_id = st.id) as has_money
      from public.students st where st.id = any (p_ids)
  loop
    -- stop collecting from them either way
    update public.student_collector_assignments
       set unassigned_at = now(), unassigned_by = auth.uid()
     where student_id = s.id and unassigned_at is null;

    if s.has_money then
      if s.status = 'archived' then skipped := skipped + 1; continue; end if;
      update public.students set status = 'archived' where id = s.id;
      archived := archived + 1;
    else
      delete from public.student_collector_assignments where student_id = s.id;
      delete from public.students where id = s.id;
      deleted := deleted + 1;
    end if;
  end loop;
  return jsonb_build_object('archived', archived, 'deleted', deleted, 'skipped', skipped);
end $$;

-- Students: bring archived ones back ------------------------------------------
create or replace function public.bulk_restore_students(p_ids uuid[])
returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform app_private.require_role(array['admin']::public.app_role[]);
  update public.students set status = 'active' where id = any (p_ids) and status = 'archived';
  get diagnostics n = row_count;
  return n;
end $$;

-- Months: delete only if nothing is recorded against them ---------------------
create or replace function public.bulk_delete_months(p_ids uuid[], p_reason text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  m record; deleted int := 0; skipped int := 0;
begin
  perform app_private.require_role(array['admin']::public.app_role[]);
  if coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'Please give a reason' using errcode = 'P0001'; end if;
  perform app_private.set_reason(p_reason);
  for m in select id from public.fund_months where id = any (p_ids) loop
    if exists (select 1 from public.payments where month_id = m.id)
       or exists (select 1 from public.waivers where month_id = m.id)
       or exists (select 1 from public.expenses where month_id = m.id)
       or exists (select 1 from public.other_income where month_id = m.id) then
      skipped := skipped + 1; continue;
    end if;
    delete from public.fund_months where id = m.id;
    deleted := deleted + 1;
  end loop;
  return jsonb_build_object('deleted', deleted, 'skipped', skipped);
end $$;

-- Months: close or reopen many ------------------------------------------------
create or replace function public.bulk_set_months_status(p_ids uuid[], p_close boolean, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  m record; done int := 0; skipped int := 0;
begin
  perform app_private.require_role(array['admin']::public.app_role[]);
  if not p_close and coalesce(length(trim(p_reason)), 0) < 5 then
    raise exception 'Please give a reason for reopening' using errcode = 'P0001';
  end if;
  for m in select id, status from public.fund_months where id = any (p_ids) order by year, month loop
    if p_close then
      if m.status <> 'open' or exists (select 1 from public.expenses where month_id = m.id and status = 'pending') then
        skipped := skipped + 1; continue;
      end if;
      perform public.close_fund_month(m.id, p_reason);
    else
      if m.status <> 'closed' then skipped := skipped + 1; continue; end if;
      perform public.reopen_fund_month(m.id, p_reason);
    end if;
    done := done + 1;
  end loop;
  return jsonb_build_object('done', done, 'skipped', skipped);
end $$;

-- Expenses: approve / reject many ---------------------------------------------
create or replace function public.bulk_decide_expenses(p_ids uuid[], p_approve boolean, p_reason text default null, p_allow_deficit boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  e record; done int := 0; skipped int := 0; v_total bigint := 0;
begin
  perform app_private.require_role(array['admin','treasurer']::public.app_role[]);
  if not p_approve and coalesce(length(trim(p_reason)), 0) < 3 then
    raise exception 'Please give a reason for rejecting' using errcode = 'P0001';
  end if;
  for e in
    select x.id, x.amount, x.status, x.submitted_by, m.status as month_status
      from public.expenses x join public.fund_months m on m.id = x.month_id
     where x.id = any (p_ids) order by x.created_at
  loop
    if e.status <> 'pending' or e.month_status <> 'open' or (p_approve and e.submitted_by = auth.uid()) then
      skipped := skipped + 1; continue;
    end if;
    perform public.decide_expense(e.id, p_approve, p_reason, p_allow_deficit);
    done := done + 1; v_total := v_total + e.amount;
  end loop;
  return jsonb_build_object('done', done, 'total', v_total, 'skipped', skipped);
end $$;

-- Expenses: void many (the safe "delete") --------------------------------------
create or replace function public.bulk_void_expenses(p_ids uuid[], p_reason text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  e record; done int := 0; skipped int := 0; v_total bigint := 0;
begin
  perform app_private.require_role(array['admin']::public.app_role[]);
  if coalesce(length(trim(p_reason)), 0) < 5 then raise exception 'Please give a reason' using errcode = 'P0001'; end if;
  for e in
    select x.id, x.amount, x.status, m.status as month_status
      from public.expenses x join public.fund_months m on m.id = x.month_id
     where x.id = any (p_ids)
  loop
    if e.status not in ('approved', 'pending') or e.month_status <> 'open' then
      skipped := skipped + 1; continue;
    end if;
    perform public.void_expense(e.id, p_reason);
    done := done + 1; v_total := v_total + e.amount;
  end loop;
  return jsonb_build_object('done', done, 'total', v_total, 'skipped', skipped);
end $$;

-- Grants: signed-in staff only (each function checks the role itself) ---------
revoke execute on function public.bulk_reverse_payments(uuid[], text) from public, anon;
revoke execute on function public.bulk_remove_students(uuid[], text) from public, anon;
revoke execute on function public.bulk_restore_students(uuid[]) from public, anon;
revoke execute on function public.bulk_delete_months(uuid[], text) from public, anon;
revoke execute on function public.bulk_set_months_status(uuid[], boolean, text) from public, anon;
revoke execute on function public.bulk_decide_expenses(uuid[], boolean, text, boolean) from public, anon;
revoke execute on function public.bulk_void_expenses(uuid[], text) from public, anon;
grant execute on function
  public.bulk_reverse_payments(uuid[], text), public.bulk_remove_students(uuid[], text),
  public.bulk_restore_students(uuid[]), public.bulk_delete_months(uuid[], text),
  public.bulk_set_months_status(uuid[], boolean, text),
  public.bulk_decide_expenses(uuid[], boolean, text, boolean), public.bulk_void_expenses(uuid[], text)
  to authenticated;
