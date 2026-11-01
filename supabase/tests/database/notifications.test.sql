-- pgTAP: run with `supabase test db` against a local database (requires Docker).
begin;
select plan(17);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'a@example.test'),
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'b@example.test');

-- Act as user A.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

select lives_ok(
  $$insert into public.notification_preferences default values$$,
  'a user can create their own preferences'
);
select is((select bus_lead_minutes::int from public.notification_preferences), 5, 'the bus lead time defaults to 5 minutes');
select throws_ok(
  $$update public.notification_preferences set bus_lead_minutes = 0$$,
  '23514', null, 'a bus lead time outside 1-15 minutes is rejected'
);

select lives_ok(
  $$insert into public.notifications (type, title, dedupe_key, expires_at)
    values ('leave_now', 'Route L is about 5 min away', 'trip-1:stop-1', now() + interval '10 minutes')$$,
  'a user can create their own notification'
);
select throws_ok(
  $$insert into public.notifications (type, title, dedupe_key, expires_at)
    values ('leave_now', 'Route L is about 5 min away', 'trip-1:stop-1', now() + interval '10 minutes')$$,
  '23505', null, 'the same reminder cannot be created twice'
);
select throws_ok(
  $$insert into public.notifications (user_id, type, title, dedupe_key, expires_at)
    values ('00000000-0000-0000-0000-0000000000b2', 'alert', 'Spoof', 'spoof', now() + interval '10 minutes')$$,
  '42501', null, 'a user cannot create a notification for someone else'
);
select throws_ok(
  $$insert into public.notifications (type, title, link, dedupe_key, expires_at)
    values ('alert', 'Outside link', 'https://example.com', 'external', now() + interval '10 minutes')$$,
  '23514', null, 'links must stay inside the app'
);
select throws_ok(
  $$insert into public.notifications (type, title, dedupe_key, expires_at)
    values ('class', 'Already expired', 'expired', now() - interval '1 minute')$$,
  '23514', null, 'a notification cannot expire before it is created'
);

select lives_ok($$update public.notifications set read_at = now()$$, 'a user can mark their notification read');
select is((select count(*)::int from public.notifications where read_at is not null), 1, 'the notification is marked read');
select throws_ok(
  $$update public.notifications set title = 'Changed'$$,
  '42501', null, 'a notification''s text cannot be rewritten'
);

-- Act as user B.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
select is((select count(*)::int from public.notifications), 0, 'another user cannot read the notification');
select is((select count(*)::int from public.notification_preferences), 0, 'another user cannot read the preferences');
with changed as (update public.notifications set read_at = now() returning 1)
  select is((select count(*)::int from changed), 0, 'another user cannot mark the notification read');
with removed as (delete from public.notifications returning 1)
  select is((select count(*)::int from removed), 0, 'another user cannot clear the notification');

-- Signed-out visitors (anon) have no access at all.
reset role;
set local role anon;
select throws_ok($$select * from public.notifications$$, '42501', null, 'signed-out visitors cannot read notifications');
select throws_ok($$select * from public.notification_preferences$$, '42501', null, 'signed-out visitors cannot read preferences');

select * from finish();
rollback;
