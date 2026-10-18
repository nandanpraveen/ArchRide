# Week 1 transit handoff

Owner: `varunsayana`. GitHub Project draft: https://github.com/users/nandanpraveen/projects/1?pane=issue&itemId=268072403

## What is implemented

- Additive migration for normalized shared GTFS data, route geometry, trip direction/variant, ordered stop occurrences, calendars/exceptions/frequencies, latest vehicles, private observations/events, source predictions, alerts/selectors, verified buildings/entrances, walking-cache storage, feed health, retention, and private job diagnostics.
- Trusted Node.js worker with central session advisory lock, per-feed atomic transactions, static fetch no more than once per successful 24-hour interval, validation, bounded retries, provider backoff, replay deduplication, timestamp guards, last-good-state preservation, and cleanup.
- Typed public read helpers, freshness/arrival rules, and `/api/health` integration. Generated database types come from the actual locally migrated PostgreSQL catalog, not handwritten approximations.
- Synthetic fixtures and database integration/security tests; an upstream probe that imports and replays actual feeds into isolated PostgreSQL. See [access-evidence.json](access-evidence.json).
- Disabled-by-default GitHub Actions schedule and deployment instructions below. Nothing was applied to hosted Supabase or enabled in GitHub by this change.

## Source access record

The user supplied `KTP - Bus Tracker.pdf`. Its Resources section reproduces a Passio email addressed to Jadon, supplying UGA static GTFS and realtime service alerts, trip updates and vehicle positions. It says realtime is protobuf and static should be fetched once every 24 hours. The team document also records crediting Passio and keeping use non-commercial. This is supporting evidence for this student project, not a blanket license or confirmation of an arbitrary polling rate.

| Feed     | Endpoint suffix after `https://passio3.com/uga/passioTransit/gtfs/` | Format                | Credentials observed |
| -------- | ------------------------------------------------------------------- | --------------------- | -------------------- |
| Static   | `google_transit.zip`                                                | ZIP of GTFS CSV files | None                 |
| Vehicles | `realtime/vehiclePositions`                                         | GTFS-RT protobuf      | None                 |
| Arrivals | `realtime/tripUpdates`                                              | GTFS-RT protobuf      | None                 |
| Alerts   | `realtime/serviceAlerts`                                            | GTFS-RT protobuf      | None                 |

All four were read successfully and inserted/replayed locally; UTC timestamps, sizes, SHA-256 hashes, counts and rejected-entity counts are in the evidence file. Its check occurred on October 17, 2026 in both UTC and Eastern time; the feed service date may differ from the wall date around midnight. The supplied source timezone is `America/New_York`.

**Still needs the team/provider:** retain the original email in team records; confirm that the supplied permission covers this app's redistribution and deployment; confirm minimum realtime polling interval, quotas, attribution placement, caching/history limits, and contact for outages. No numeric quota was supplied. Do not interpret a successful unauthenticated request as unlimited access. The endpoint is the approved candidate; no replacement source is needed while it works. The linked Athens-Clarke Transitland listing is a discovery lead only, not an ingested or approved fallback. Never silently mix Athens city data into UGA routes.

Display “Transit data provided by UGA and Passio” wherever transit is shown, keep the student-built/non-commercial affiliation statement, and preserve source provenance. No provider credentials were requested, logged, or checked in.

## Activate hosted ingestion

For deployment by an authorized teammate without giving the contributor database access, use [MAINTAINER_HANDOFF.md](MAINTAINER_HANDOFF.md).

1. Use your authorized Supabase project access. No hosted credentials or CLI login are present on this clone. Do not paste database secrets into chat. Review the new migration with the task 3 owner before applying; personal tables remain their responsibility.
2. With the project's supported Supabase CLI, run `supabase link --project-ref yivnryjbzhampecphlgr`, `supabase db push --linked --dry-run`, then `supabase db push --linked`. Existing applied migrations are unchanged. Verify public/private grants and run Supabase advisors. Run `pnpm db:types` and compare the hosted catalog with the locally generated types.
3. Configure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the app. For the trusted worker only, store a TLS-verified database URI as `TRANSIT_DATABASE_URL` in a secret manager. Use a direct connection or Supavisor **session** mode; session advisory locks do not work with transaction pooling. Use `sslmode=verify-full` and the provider's trusted CA as needed; do not disable certificate verification. Prefer a dedicated role with only shared transit/feed-health access. It needs the same worker table privileges as `service_role` and BYPASSRLS; do not grant access to private personal tables.
4. Once use and polling limits have been confirmed, set `transit_sources.enabled=true` for `uga-passio` using the authorized SQL editor. Record the confirmation date/rate in this source record. Set the worker's `TRANSIT_SOURCE_APPROVED=true`.
5. Run `pnpm transit:ingest` once from the trusted environment. It performs static import if due, then vehicles/arrivals/alerts and cleanup. An unset approval flag, missing connection or disabled source fails closed. Logs contain only feed IDs, counts, timestamps, outcomes and bounded error codes.
6. Verify the smoke checks below **before** enabling a recurring schedule. Store `TRANSIT_DATABASE_URL` as a GitHub Actions secret only if using Actions. Set repository variables `TRANSIT_SOURCE_APPROVED=true` and `TRANSIT_INGESTION_ENABLED=true`. The included workflow runs every five minutes with job concurrency and a database advisory lock. Actions scheduling can be delayed, and five-minute samples will often be stale under the three-minute UI threshold. It is a low-frequency bootstrap, not a live-map service guarantee.
7. For a live map, use one continuously managed trusted worker timer at the **provider-approved** interval (for example, 30 seconds only if explicitly permitted), invoking the same command. Disable the Actions schedule when switching. A systemd service/timer example is included in [deployment/](deployment/). Keep one global poller, never one per visitor. Validate the host's quota/billing budget before enabling.

At a 30-second interval, three realtime endpoints mean approximately 259,200 upstream requests/month; 5-minute polling means approximately 25,920/month (30 days), plus daily static requests and bounded retries. These are workload estimates, not provider quota claims. Observation growth is roughly vehicles × 86,400 / poll-seconds per day when timestamps change. Check actual row/index sizes and free-plan database/egress/compute usage daily; reduce retention/polling or provision capacity before exhausting budget. The database defaults to 24h observations, 14d observed events, 7d jobs, 15m prediction validity, and cache-specified expiry. Tune `transit_retention` within its bounds; latest vehicle state is separate and expires only after seven days without receipt.

## Hosted smoke test and rollback

- Run once, then replay: latest row counts and observation/event uniqueness stay stable for identical source timestamps. Feed health should report a successful static load and all three realtime sources. Empty service is allowed and has count zero.
- Open `/api/health` with public configuration: `database=connected`; `transit=connected` only if all four feeds are current. A successful DB query can return HTTP 200 with `transit=degraded`; monitor that field separately. No configuration returns 503. Confirm the Home/Map owners use the supplied freshness helpers before displaying data as current.
- Test a guest publishable client: SELECT routes/stops/current transit succeeds; INSERT/UPDATE/DELETE fail; raw observations/events/job diagnostics/retention are inaccessible. Repeat with an ordinary signed-in user. The automated tests verify this on PostgreSQL roles; hosted PostgREST/grants need this smoke test too.
- Check `transit_job_runs` as a trusted operator for each feed. Simulate a worker/network failure in staging; the last valid rows remain, health becomes stale, and recovery replaces only newer revisions. Observe overlapping invocations yielding `overlap_skipped` with a direct/session connection.
- Check static frequencies/repeated stops, source cancellation, service-date rollover, provider alerts and hidden-tab frontend behavior with their feature owners. Frontend polling must only read Supabase, never Passio.
- Rollback operations: set `TRANSIT_INGESTION_ENABLED=false`, disable the host timer if used, and set `transit_sources.enabled=false`. Retain the last valid shared snapshot; UI freshness ages naturally. Roll back the app/worker deployment if necessary. Do not drop the migration or clear tables to recover an outage. Rotate a compromised worker secret through its secret manager.
- Daily: monitor missing attempts, error/rejection counts, source age, retained row growth and upstream 429s. After a 429 exceeding 30 seconds, the worker ends that feed without shortening the requested wait. The provider cooldown is persisted in `feed_status.next_attempt_at` and subsequent worker runs skip the feed until it expires. Pause the schedule if rate limits persist.

## Team contracts

- Public IDs are source-prefixed (`uga-passio:<upstream-id>`); raw upstream IDs remain in `source_id_raw` and timestamps are UTC ISO strings. GTFS service dates/times remain agency-local; seconds may exceed 86,400. Never parse service time as a normal same-day JS date.
- Route variant is the **trip**: route + direction + shape + ordered occurrences. There is no invented direction when GTFS omits it. `transit_stop_times` keys use trip + stop sequence; repeated physical stops are distinct. Frequency instances use trip + GTFS start date + start time. Static paths use `[longitude, latitude]` order and source sequence. Calendar CSV fields and exceptions retain original values in JSON; planner must apply both, then frequency windows, in agency timezone.
- `src/lib/transit/contracts.ts`: public row types, `feedFreshness`, `vehicleFreshness`, `usableArrival`. Stale threshold is 180 seconds realtime / 48 hours static; it is a display policy, not an accuracy claim. A repeated HTTP fetch never refreshes the source/observation clock. A vehicle without an individual timestamp uses feed time and is labeled `position_timestamp_kind=feed`.
- `src/lib/transit/read.ts`: caller-supplied public Supabase client; routes/stops, vehicles, health, and up to three usable arrivals for a stop. Additional route/trip/stop queries can use the generated table types. Stop-time and larger route catalogs need pagination if they exceed PostgREST's default row limit.
- An arrival is usable only if source-provided, scheduled, future, unexpired, and recent by trip-update clock. No delay-only ETA calculation is invented. `CANCELED`, `SKIPPED`, `NO_DATA`, stale and missing predictions must not show a countdown. Absence does not imply route cancellation. Cancellations apply to a **trip instance**, never the entire route. Uncertainty is nullable and never inferred from an omitted protobuf field.
- Each feed commits independently. Malformed entities are rejected and counted, valid entities may commit, and partial snapshots never clear absent entities. An entirely invalid response leaves the previous snapshot intact. Out-of-order feed/individual entity revisions never overwrite newer ones. Non-cancellation disappearance expires predictions; vehicle positions stay available as last-known positions, with source time visible.
- Agency-wide alerts have null route/stop/trip selectors and apply globally; selectors retain other GTFS criteria in JSON. Filter active periods at display time. Do not inject alert text as HTML or use unvalidated URLs. Manual notices need a separately labeled admin feature.
- `transit_arrival_events` are observed transitions into source `STOPPED_AT`, requiring a vehicle timestamp. They are not measured door-open times or verified ground truth; prediction evaluation must account for polling resolution and missed transitions. Repeated stopped samples do not create a new arrival each poll.
- Buildings/entrances are intentionally empty until a verified campus source is supplied. Do not relabel stop coordinates as entrances. Task 1 owns building search UX and should show available stops until verified campus records are added. Walking cache stores **public verified location IDs**, never private user GPS histories. Task 5 owns walking provider integration and expiration choices.
- Task 3 owns private profiles/favorites/classes/jobs/user permissions; this migration deliberately does not create those tables. Task 4 owns map/tile licensing and browser refresh behavior. Tasks 5/6 own journey timing and evaluation. Task 11 can read private diagnostics through trusted authorized operations.

## Commands and evidence

See [VALIDATION.md](VALIDATION.md) for the checks actually run and remaining production verification.

```sh
pnpm install --frozen-lockfile
pnpm test:transit       # deterministic fixtures + PostgreSQL role/RLS/integration checks
pnpm db:types:local     # regenerate from all checked-in migrations, no hosted secrets
pnpm transit:probe     # actual upstream reads + isolated import/replay, updates evidence JSON
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The probe is an explicit network check, not part of CI or recurring frontend traffic. It never writes to hosted Supabase. Synthetic fixture IDs/text are in `tests/transit/fixtures.ts` and cannot be confused with production rows. The real evidence records metadata/counts rather than committing raw source snapshots.

## Remaining acceptance gates

The local implementation can be reviewed now. The GitHub draft should remain open until the hosted migration/type generation, actual scheduled run, verified quota/permission record, hosted guest-write denial, and teammate Home/Map integration are complete. Also obtain a verified campus buildings/entrances dataset if building search is part of this week's closing criteria. Source connectivity alone does not establish those gates.
