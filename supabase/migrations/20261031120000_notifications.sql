-- Leave-now reminders and notification center (task 10). Delivery is in-app only: the browser
-- creates a row while the app is open, so every row is created, read and cleared by its owner.

-- Account-wide notification settings, one row per student.
create table public.notification_preferences (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  leave_now_enabled boolean not null default true,
  class_reminders_enabled boolean not null default true,
  alerts_enabled boolean not null default true,
  trip_updates_enabled boolean not null default true,
  -- Notify when a watched bus is this many minutes from its stop. Walking time is not estimated.
  bus_lead_minutes smallint not null default 5 check (bus_lead_minutes between 1 and 15),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Reuses the generic updated_at trigger function from the classes migration.
create trigger notification_preferences_set_updated_at before update on public.notification_preferences
  for each row execute function public.classes_set_updated_at();

-- Notification center history. Text is short so lock-screen content can stay minimal.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type text not null check (type in ('leave_now', 'class', 'alert', 'trip')),
  title text not null check (char_length(title) between 1 and 80),
  body text not null default '' check (char_length(body) <= 200),
  -- In-app paths only (for example /map?stop=...), never an external site.
  link text not null default '/' check (link ~ '^/([^/\\]|$)'),
  -- Identifies one reminder (for example one bus trip at one stop) so retries cannot duplicate it.
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 200),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  read_at timestamptz,
  constraint notifications_expire_after_creation check (expires_at > created_at),
  constraint notifications_one_per_key unique (user_id, dedupe_key)
);
create index notifications_user_created on public.notifications(user_id, created_at desc);

alter table public.notification_preferences enable row level security;
alter table public.notifications enable row level security;
revoke all on public.notification_preferences, public.notifications from anon, authenticated;
grant select, insert, update, delete on public.notification_preferences to authenticated;
grant select, insert, delete on public.notifications to authenticated;
-- Owners may only mark a notification read; its text, link and expiry cannot be rewritten later.
grant update (read_at) on public.notifications to authenticated;
grant all on public.notification_preferences, public.notifications to service_role;

create policy "Read own notification preferences" on public.notification_preferences for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Create own notification preferences" on public.notification_preferences for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Update own notification preferences" on public.notification_preferences for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Delete own notification preferences" on public.notification_preferences for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Read own notifications" on public.notifications for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Create own notifications" on public.notifications for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Mark own notifications read" on public.notifications for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Clear own notifications" on public.notifications for delete to authenticated
  using ((select auth.uid()) = user_id);
