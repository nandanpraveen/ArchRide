-- Trusted admin roles. Stored in their own table, never in editable user_metadata.
-- Rows are managed only through the maintainer's authorized SQL editor or service role.
create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null
);

alter table public.admin_users enable row level security;
revoke all on public.admin_users from public, anon, authenticated;
grant select, insert, update, delete on public.admin_users to service_role;
create policy "No browser access" on public.admin_users
  for all to anon, authenticated using (false) with check (false);

-- Lets a signed-in user ask only "am I an admin?" about themselves.
-- Runs as the table owner so the browser never gets direct read access to admin_users.
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.admin_users where user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- To grant admin (maintainer only, in the SQL editor):
--   insert into public.admin_users (user_id) values ('<auth user uuid>');
