-- Private weekly class schedule. Times are campus wall-clock (America/New_York), stored as "HH:mm".
-- building_id intentionally has no foreign key: a retired building must not delete a student's class,
-- and the saved building_name keeps the row readable until the student picks a replacement.
create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  building_id text not null check (char_length(building_id) between 1 and 200),
  building_name text not null default '' check (char_length(building_name) <= 200),
  -- Luxon/ISO numbering: Monday = 1 ... Sunday = 7. Duplicate days are rejected by the app.
  weekdays smallint[] not null check (cardinality(weekdays) between 1 and 7 and weekdays <@ array[1,2,3,4,5,6,7]::smallint[]),
  starts_at text not null check (starts_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  minutes_early smallint not null default 0 check (minutes_early between 0 and 60),
  enabled boolean not null default true,
  reminder_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index classes_user_id on public.classes(user_id);
create trigger classes_set_updated_at before update on public.classes
  for each row execute function public.set_updated_at();

alter table public.classes enable row level security;
revoke all on public.classes from anon, authenticated;
grant select, insert, update, delete on public.classes to authenticated;
grant all on public.classes to service_role;
create policy "Read own classes" on public.classes for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Create own classes" on public.classes for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Update own classes" on public.classes for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Delete own classes" on public.classes for delete to authenticated
  using ((select auth.uid()) = user_id);
