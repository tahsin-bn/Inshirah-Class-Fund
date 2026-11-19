-- First-run setup helpers used by the admin-users edge function.

-- Anyone may ask whether first-time setup is still needed (reveals nothing else).
create or replace function public.needs_bootstrap()
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.profiles where role = 'admin' and is_active)
$$;
grant execute on function public.needs_bootstrap() to anon, authenticated;

-- Only the service role (edge function) may check the bootstrap email.
create or replace function public.bootstrap_email_allowed(p_email text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.needs_bootstrap()
     and exists (select 1 from app_private.config c
                 where c.bootstrap_admin_email is not null and lower(c.bootstrap_admin_email) = lower(trim(p_email)))
$$;
revoke execute on function public.bootstrap_email_allowed(text) from public, anon, authenticated;
grant execute on function public.bootstrap_email_allowed(text) to service_role;

-- The bootstrap admin email is set once, outside version control:
--   update app_private.config set bootstrap_admin_email = 'you@example.com';
