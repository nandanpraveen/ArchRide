-- Minimal starter schema. Full transit and personal-data models are roadmap tasks.
create table public.feed_status (
  id text primary key,
  state text not null default 'not_configured' check (state in ('not_configured','healthy','stale','unavailable')),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.feed_status enable row level security;
grant select on public.feed_status to anon, authenticated;
grant all on public.feed_status to service_role;
create policy "Anyone can read feed health" on public.feed_status for select to anon, authenticated using (true);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
create policy "Read own profile" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "Create own profile" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "Update own profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "Delete own profile" on public.profiles for delete to authenticated using ((select auth.uid()) = id);

insert into public.feed_status (id, state) values ('uga-passio','not_configured');
