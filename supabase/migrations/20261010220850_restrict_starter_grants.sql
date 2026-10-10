-- Remove legacy default privileges before assigning the intended API surface.
revoke all on public.feed_status from anon, authenticated;
revoke all on public.profiles from anon, authenticated;
grant select on public.feed_status to anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
