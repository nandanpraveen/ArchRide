# Browser leave-time notifications

Live at [ArchRide](https://nandanpraveen.github.io/archride/): private migration applied, VAPID keys installed, `push-reminders` deployed, and the one-minute cron enabled. [Release evidence](evidence/browser-push-release.json) records production checks and a real desktop Chrome subscription receiving a scheduled push with the ArchRide tab closed. Browser receipt was confirmed through Chrome’s persistent notification list, and the owner confirmed the desktop alert appeared after both macOS Chrome notification entries were enabled. Physical iPhone/Android delivery remains unverified. [Hosted API smoke evidence](evidence/push-hosted-smoke.json) separately covers configuration, sync, update, dispatch, validation, and unsubscribe using a disposable subscription fixture. The activation runbook below documents recovery or setup in another environment.

## Student flow

In Profile → Leave-now reminders, choose **Enable browser notifications** and allow the browser prompt. It is never requested on page load. On iPhone/iPad, first open ArchRide in Safari, choose Share → Add to Home Screen, and open the installed app (iOS/iPadOS 16.4+).

- Start a bus trip to include walking time to the boarding stop and the safety buffer. The selected live arrival occurrence is rechecked by the server every minute. A watch without a planned walk uses the chosen 1–15 minute lead time.
- Start a walking trip with an arrive-by deadline to arm a building reminder. Leave time is deadline minus walking duration minus buffer. Completing or ending the trip removes that reminder on the next sync.
- Class reminders use the default origin, cached walking duration adjusted for walking pace, arrival margin, and buffer. Without a cached route they say only “Your class is coming up.” Plan that walk once to populate the route cache. Each class’s reminder switch must be enabled.
- Quiet hours use Athens time. Replan if your starting point changes; background GPS is not collected. Open the app weekly to refresh the next seven days of class reminders (up to 63 meetings plus one active walk).
- Turn off browser notifications or use Clear device data to unsubscribe and remove server data. Signing out also unsubscribes. OS/browser permission can be revoked separately in site settings. Browser “clear site data” cannot notify the server, so orphan records expire within eight days.

On macOS, browser permission alone is not enough if System Settings → Notifications has Chrome turned off. Check both Chrome entries when macOS lists more than one. Allow desktop/Notification Center display, and check Focus or screen-sharing suppression if a received push is not visible. ArchRide cannot detect or override these OS settings.

## Runtime and privacy

The app remains statically exported for GitHub Pages, including `/archride/`-scoped service worker, manifest, icons, and notification click links. There is no fetch handler or offline cache. The worker handles push even with no page loaded; tapping opens the relevant plan or stop. An expired instruction is suppressed rather than delivered late.

Only opt-in uploads a push subscription, watched bus identifiers and stop labels, derived reminder times/text/plan links, preferences and quiet hours. No precise GPS coordinates, full class records, display name, or email are uploaded for push. The API does not require a student account: a random 256-bit device capability authorizes sync and deletion. Only its SHA-256 hash is stored. Subscription endpoints and schedules are in `archride_private`, with RLS and no student Data API grants. Endpoints are restricted to known browser push providers to prevent SSRF. Network admission, 30 new devices/network/hour, and a 1,000-record ceiling bound enrollment. Do not log capabilities, subscriptions, or payloads.

Dispatch uses the same leave-now, walking, freshness, cancellation, exact-occurrence, quiet-hour and preference rules as the app. Missing/stale predictions never produce a confident departure instruction. Server handled keys survive sync and deduplicate pushes. Native notification tags replace repeated deliveries after a network retry. `404/410` removes a dead subscription; other failures retry only while the reminder is timely. A server crash after push acceptance but before committing the handled key can retry the same tag.

The single dispatcher checks at most 100 devices per minute and stops starting work after 45 seconds. This is a small-deployment ceiling: measure dispatch latency and increase throughput before reaching 100 concurrently watched devices. The worker does not guarantee an exact alarm; network, Focus/Do Not Disturb, browser suspension, or push-provider delays can prevent or delay delivery. Scheduled jobs more than 90 seconds overdue are discarded. Push TTL is at most 60 seconds, with a worker delivery deadline; never describe these as guaranteed alarms.

## Activate the service

1. Run `node scripts/create-push-secrets.mjs` once. It writes `.secrets/browser-push.env` with mode 0600, never prints keys, and refuses to overwrite existing keys. Retain the original VAPID keys; changing them requires browser re-subscription.
2. Apply `supabase/migrations/20261108003314_browser_push_reminders.sql` through the normal reviewed migration deployment. It creates a new private table and indexes only; existing notifications are untouched.
3. Run `supabase secrets set --env-file .secrets/browser-push.env --project-ref <project-ref>`. The function also uses the existing `SUPABASE_DB_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `ARCHRIDE_RATE_SALT` server secrets.
4. Run `pnpm push:build`, then `supabase functions deploy push-reminders --project-ref <project-ref>`. The checked-in config sets `verify_jwt=false`; the handler enforces its own device/job authorization.
5. Store `PUSH_JOB_TOKEN` in Vault as `push_job_token`, without printing it or committing it. The existing Vault `project_url` must contain this project’s HTTPS URL. Enable the one-minute job:

```sql
select cron.schedule('archride-push-reminders', '* * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='project_url') || '/functions/v1/push-reminders',
    headers := jsonb_build_object('Content-Type','application/json', 'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='push_job_token')),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$job$);
```

6. Deploy the static app with the normal `pnpm build:pages` workflow. It obtains the public VAPID key from the function at enable time, so no additional frontend secret or build variable is needed.
7. With a real device, enable permission, plan a reachable bus and an arrive-by walk, close the app, check delivery and tap routing, then turn off and confirm no further pushes. Repeat with an installed iPhone app, Android Chrome, denied/revoked permission, quiet hours, stale arrivals, and offline recovery. Inspect cron results and dead-subscription cleanup. Automated fixtures do not prove OS delivery.

Sources: [Next.js bundled PWA guide](../node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md), [MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API), [WebKit iOS Web Push](https://webkit.org/blog/13878/), [Supabase scheduled functions](https://supabase.com/docs/guides/functions/schedule-functions), [web-push API](https://github.com/web-push-libs/web-push#api-reference).

## Verification

`pnpm test:notifications` covers schedule arithmetic, missing-route wording, live bus identity/freshness/walk timing, preferences, quiet hours, late wake-ups, validation, private-table permissions, and a service-worker push/click with no open page. `tests/e2e/browser-notifications.spec.ts` covers explicit opt-in, sync, disable, clear-data revocation, denied permission, unavailable service, iPhone installation guidance, and 320px/desktop layouts. Browser push subscriptions and network delivery are fixtures; real native delivery remains a deployment acceptance check.

`deno test --allow-env --config supabase/functions/push-reminders/deno.json supabase/functions/push-reminders/runtime.test.ts` verifies actual handler startup and request guards, plus VAPID signing and payload encryption with the pinned runtime package. It starts no server and sends no push.
