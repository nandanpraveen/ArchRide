-- pgTAP: run with `supabase test db` against a local database (requires Docker).
begin;
select plan(9);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'a@example.test'),
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'b@example.test');

-- Act as user A.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

select lives_ok(
  $$insert into public.classes (title, building_id, building_name, weekdays, starts_at)
    values ('Calculus', 'building', 'Memorial Building', '{1,4}', '09:30')$$,
  'a user can create their own class'
);
select is((select count(*)::int from public.classes), 1, 'a user sees their own class');
select is((select user_id from public.classes limit 1), '00000000-0000-0000-0000-0000000000a1'::uuid, 'user_id defaults to the caller');

select throws_ok(
  $$insert into public.classes (user_id, title, building_id, weekdays, starts_at)
    values ('00000000-0000-0000-0000-0000000000b2', 'Spoof', 'building', '{1}', '09:30')$$,
  '42501', null, 'a user cannot create a class for someone else'
);
select throws_ok(
  $$insert into public.classes (title, building_id, weekdays, starts_at) values ('Bad time', 'building', '{1}', '25:61')$$,
  '23514', null, 'invalid start times are rejected'
);
select throws_ok(
  $$insert into public.classes (title, building_id, weekdays, starts_at) values ('Bad day', 'building', '{0}', '09:30')$$,
  '23514', null, 'weekday 0 is rejected'
);

-- Act as user B.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
select is((select count(*)::int from public.classes), 0, 'another user cannot read the class');
with changed as (update public.classes set title = 'Hijacked' returning 1)
  select is((select count(*)::int from changed), 0, 'another user cannot update the class');
with removed as (delete from public.classes returning 1)
  select is((select count(*)::int from removed), 0, 'another user cannot delete the class');

select * from finish();
rollback;
