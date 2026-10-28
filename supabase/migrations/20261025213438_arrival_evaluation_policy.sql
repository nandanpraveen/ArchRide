-- Explicit deny documents the boundary in advisors; service_role bypasses RLS.
create policy "No browser prediction history" on archride_private.arrival_predictions
for all to anon, authenticated using(false) with check(false);
