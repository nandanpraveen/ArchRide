# ArchRide operations

Project: `yivnryjbzhampecphlgr` (Free plan). Public site: `https://nandanpraveen.github.io/archride/`. Student features use device storage; public signups and anonymous Auth are disabled. Existing personal tables and their ownership rules remain intact. Operator access is separate from student browsing.

## Verified state

The November 5, 2026, **14:24 UTC** readback found a **115,259,059-byte database** (109.9 MiB, 23.05% of the 500 MB quota), down 31,940,608 bytes from November 4. Vehicle history held 24,846/200,000 rows, prediction history 31,843/200,000, job history 36,256/60,000, and walking cache 19/2,000. No active or expired request leases remained; two nonexpired network counter rows followed the public health check. All 12 ArchRide cron jobs were enabled; 443 recorded SQL cron runs succeeded in the preceding hour. History, walking-cache, and request-counter cleanup had zero failures over the preceding 24 hours. The 107 observation rows and 38 job rows just past their rolling time cutoffs were approximately four minutes old beyond the cutoff, within the ten-minute cleanup interval.

All four feed statuses independently reported healthy, including 438 accepted arrival rows and 32 vehicles. Queued dispatch success does not prove successful ingestion. The earlier November 4 snapshot predates the fixed-trip correction below; ingestion v10 subsequently restored fully accepted arrivals. These are operational snapshots, not accuracy measurements.

Evidence:

- [Current release operations snapshot](evidence/release-operations-status.json)
- [Historical November 4 snapshot](evidence/production-operations-status.json)
- [Anonymous production checks](evidence/production-anonymous-smoke.json): 19 checks, including spoof resistance, direct-read denial, real HTTP 429/Retry-After, concurrency admission, and anonymous report validation.
- [Gateway boundary check](evidence/gateway-network-boundary.json): temporary probe removed after verification.
- [Public catalog recovery drill](evidence/catalog-recovery-drill.json)
- [Fixed-trip source diagnosis and replay](evidence/fixed-trip-descriptor-diagnosis.json), [hosted correction smoke](evidence/fixed-trip-hosted-smoke.json)
- [Final public health read](evidence/release-health.json): November 5, 14:22 UTC, HTTP 200, database connected and all four feeds current (443 arrival rows, 32 vehicles).
- [Live walking endpoint/CORS check](evidence/production-walking-smoke.json): current Tate Student Center to Memorial Hall path returned HTTP 200.

## Request admission

| Operation | Per network | Whole project | Concurrent admitted work |
| --- | --- | --- | --- |
| Public reads and health | 3,600/minute | 12,000/minute | 20 |
| Walking requests, including cache hits | 180/minute | 600/minute | 2 |
| Anonymous rider reports | 120/hour | 2,000/hour | 2 |

There are at most 24 admitted requests across these operations, with 30-second orphan lease expiry and an additional 12-request limit per Edge isolate. Network counters have a 10,000-row hard ceiling. Windows are fixed UTC windows; counters expire within one window plus 60 seconds and minute cron removes expired records. Concurrency rejection returns `Retry-After: 1`; exhausted network/global windows return their remaining duration.

A network means one IPv4 address or IPv6 /64, so campus NAT users share a budget. The current hosted Cloudflare gateway supplies `cf-connecting-ip`; direct injection was rejected, and spoofed forwarding/client headers could not change the effective bucket. Missing/invalid gateway identity or missing salt fails closed with 503. Other hosting/proxy arrangements require a fresh trust-boundary check before enabling traffic.

Only a daily rotating HMAC of that network prefix is stored, using the server-only `ARCHRIDE_RATE_SALT`. Raw addresses, GPS, account IDs, client-supplied bucket IDs, and device IDs are not stored in counters. Reports contain no network identifier. Salt rotation invalidates existing buckets; deploy it deliberately, outside an incident-driven retry loop.

`public-read` accepts only bounded GET/HEAD queries against its explicit table/scalar-field allowlist: maximum 1,000 rows, offset 10,000, 20 query parameters, 200 values per `in` filter, and 2 MB output. It rejects writes, private tables, relationship embeddings, and aggregates. Direct anonymous/authenticated public-table SELECT grants are revoked, preventing an alternate unmetered Data API path. Manual-notice validity and walking-cache expiry are enforced server-side.

Public-read isolates cache bounded responses for 5 seconds for live data, 30 seconds for alerts/notices, and 5 minutes for catalogs. Admission still runs before a cache hit. Source timestamps determine freshness; cache access never renews a prediction. The browser honors Retry-After and retains previously loaded transit data on read failure. Walking keeps the separate shared upstream lock and persisted one-request-per-second provider spacing; GPS-origin paths never enter persistent cache.

## Free-plan operating envelope

The [current Free quotas](https://supabase.com/docs/guides/platform/billing-on-supabase) include 500 MB database storage, 5 GB egress, and 500,000 Edge invocations per month. [Invocations count unsuccessful responses too](https://supabase.com/docs/guides/platform/manage-your-usage/edge-function-invocations); OPTIONS is excluded.

At a 30-day continuous cadence, the central 10-second worker consumes approximately 259,200 invocations. Hourly model evaluation and daily static refresh add approximately 750. About 240,000 remain for public reads, walking, reports, and health. Around 14 ordinary reads/minute gives roughly **280 aggregate browsing hours/month before search, planning, watched buses, walking, and reports**. This is a small-pilot envelope, not unlimited campus-scale capacity. Admission protects downstream work; rejected requests still consume invocations. Review actual organization usage and egress weekly and after any traffic increase. Do not enable a paid plan or disable a spend cap as an automatic recovery action.

Retention is 12 hours/200,000 rows for vehicle history, 6 hours/200,000 rows for raw prediction history, and 3 days/60,000 rows for job history. Ten-minute cleanup deletes at most 50,000 excess rows per history table per run. Observed arrival events retain 14 days. Latest transit state, campus catalogs, saved personal records, and model summaries are outside those history caps.

Walking cache admits at most 16 KiB of geometry per stored path, retaining the newest 2,000 entries with ten-minute cleanup. Larger verified paths are returned without caching. At one upstream request/second, up to 600 additional entries can appear between cleanup runs. Network buckets and leases are short lived. Current measured raw-row sizes suggest roughly 300-430 MB at the configured caps plus normal cleanup overshoot, depending on index reuse, events, and other tables; monitor actual bytes rather than treating that estimate as a hard storage guarantee. Deletion frees reusable pages and does not necessarily shrink allocated indexes immediately. Investigate at 400 MB; reduce eligible history/cache retention before 450 MB. Avoid `VACUUM FULL` on the live app.

## Checks and incident response

Run commands from this repository using the authorized linked CLI. Never print Vault values, service-role keys, session tokens, report bodies, or private student records.

```sh
supabase migration list --linked
supabase db advisors --linked --type all
supabase functions list --project-ref yivnryjbzhampecphlgr
curl --fail-with-body https://yivnryjbzhampecphlgr.supabase.co/functions/v1/health
supabase db query --linked "select pg_database_size(current_database()) as bytes;"
supabase db query --linked "select id,state,last_attempt_at,last_success_at,source_timestamp,error_code,next_attempt_at from public.feed_status where id like 'uga-passio:%';"
```

If the CLI migration listing cannot connect, read `supabase_migrations.schema_migrations` with `supabase db query --linked`; compare it with checked-in filenames. SQL checks use the linked Management API and do not require a browser account.

- **Source outage/stale arrivals:** inspect feed clocks, safe error codes, recent `transit_job_runs`, and cron status. Keep the last valid snapshot and unavailable/stale labels. A missing vehicle is not a cancellation. Do not change validity clocks to make health green.
- **429/provider quota:** honor `next_attempt_at` and Retry-After. Do not bypass persisted cooldowns, raise source cadence, or retry in a loop. Public-read cache and previously loaded views remain useful.
- **One authorized retry:** `supabase db query --linked "select archride_private.dispatch_transit('all');"`. Then inspect job results. A queued HTTP request is not proof of successful ingestion.
- **Runaway worker/lost token:** temporarily disable the existing `archride-realtime-refresh` cron job with `cron.alter_job`, rotate the dedicated Vault job token and its stored hash together through the trusted maintainer procedure, verify old-token denial and one healthy run, then re-enable the same job. Never create a second polling schedule.
- **Growth/failed cleanup:** inspect table/index sizes and retention jobs; run `archride_private.enforce_history_budget()` and `archride_private.bound_walking_cache()` once through trusted SQL, then verify counts and live state. Never truncate a history table or reset the shared database as routine cleanup.

The remaining advisor warning is leaked-password protection, which requires a paid plan. Student signup is disabled. No RLS, function-ACL, or performance advisory remained at verification; retain the advisor output with release evidence.

## Notices, corrections, and predictor operations

`admin-operations` validates current Auth identity, trusted `app_metadata.admin === true`, and a live `auth.sessions` row on every request. Editable user metadata does not authorize it; role/session revocation invalidates old-token operations. There is no student/admin sign-in screen. Use a separately provisioned maintainer identity or the owner's authorized Supabase CLI/dashboard. Do not assign a role to yourself through a public client.

For a separately authorized operator token, POST a JSON file to the protected function; keep credentials outside the repository and shell history:

```sh
curl --fail-with-body https://yivnryjbzhampecphlgr.supabase.co/functions/v1/admin-operations \
  -H "Authorization: Bearer $ARCHRIDE_OPERATOR_JWT" \
  -H 'Content-Type: application/json' --data-binary @/private/operation.json
```

Supported actions are `status`, `retry`, `cleanup`, `notice_save`, `notice_expire`, `correction_save`, and `correction_remove`. Retry/cleanup are serialized and limited to once/minute through this endpoint. Mutations append `archride_private.admin_audit`, retained 90 days.

A notice needs title/body, catalog `routeIds`/`stopIds` (both empty for campus-wide), ISO start/end timestamps, and an official HTTPS UGA `sourceUrl`; validity must be positive and at most 30 days. `notice_save` accepts an existing `id` to edit; `notice_expire` takes its `id`. Students see “Maintainer notice” separately from agency alerts. Expired notices retain 30 days before cleanup.

A correction needs `kind` (`building`/`entrance`), catalog `placeId`, verified name/coordinates, and official UGA source URL. Overrides are separate from imported values and survive reimport. `correction_remove` restores the latest original source values. Verify the selected place and a subsequent import before declaring a correction complete.

Anonymous reports are opt-in, bounded, occurrence-deduplicated, and unavailable as browser-writable tables. An unmatched report cannot affect training. Arrival/boarding reports need independent official stopped-at evidence; departure confirmation remains unsupported. Candidate evaluation runs hourly. To request one additional evaluation, call `archride_private.dispatch_predictor_update()` through trusted SQL. Inspect held-out counts and the returned serving mode. Official arrivals remain the serving baseline; zero samples, sparse data, segment replay, or an unverified report do not establish improved accuracy or calibrated windows.

## Fixed scheduled-trip compatibility

The [GTFS reference](https://gtfs.org/documentation/realtime/reference/#message-tripdescriptor) permits omitted instance date/time fields for fixed scheduled trips; frequency templates need both. The importer had applied the frequency requirement to every update. A reserved official snapshot showed 21 known fixed trips rejected despite 178 absolute stop times. Replay retained 531 rows instead of 353, with 459 rather than 305 current predictions at the original source clock.

The correction resolves identity from a verified fixed timetable and operating calendar only when source observations and absolute predictions agree on one campus date. It requires a known first departure and rejects implicit overnight/cross-date, repeated DST-hour, closed-calendar, and competing-descriptor cases. Frequency requirements, vehicle identity, repeated-stop sequence, raw ETA, observation clocks, and expiry checks remain intact. Unresolved vehicle instances cannot become arrival ground truth. Five regression tests cover these boundaries; the complete transit suite passed 58 tests. Subsequent normal hosted runs succeeded without extra provider requests.

## Export, restore, and rollback

```sh
node --env-file=.env.local --import tsx scripts/operations/catalog-recovery-drill.ts
```

This read-only command exports the live public static catalog into ignored `.secrets/public-catalog-recovery.json` (0600), rebuilds a fresh disposable PostgreSQL database from checked-in migrations, restores rows, verifies counts and denied direct browser access, and writes evidence. The verified export covered 354 buildings, 86 entrances, 161 stops, 19 routes, 22 shapes, 229 trips, 4,351 stop occurrences, and 90 frequency rows. It makes no production writes.

That drill does **not** recover Auth, existing personal rows, Vault/job credentials, raw transit history, or model/report history. Device-only schedules/preferences must be exported or backed up by the device owner. Before a destructive schema/credential operation, obtain an authorized complete backup and test a separate restore using the actual plan's [backup options](https://supabase.com/docs/guides/platform/backups). Do not present the catalog drill as full disaster recovery.

For frontend rollback, republish the previous reviewed static artifact while keeping the database's admission boundary intact. For Edge rollback, redeploy the previous reviewed function source and verify anonymous reads, denied bypasses, health, and one walking request. Never restore anonymous table grants to make an old frontend work. Migrations are additive; use a reviewed forward fix rather than resetting production or deleting historical private data. Preserve official serving mode while investigating a candidate model regression.
