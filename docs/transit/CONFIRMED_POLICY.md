# Passio confirmation and week 1 / week 2 closeout

Recorded October 25, 2026. [Provider response supplied by the project owner](passio-confirmation.json) supersedes the earlier unknown-quota and temporary-minute-polling notes.

| Feed | Minimum request spacing | Stale cutoff |
| --- | --- | --- |
| Vehicle positions | 10 seconds | 30 seconds |
| Trip updates / arrival predictions | 30 seconds | 90 seconds |
| Service alerts | 120 seconds | 360 seconds |
| Static GTFS | Daily (previous provider instruction) | 48 hours |

One private authenticated Edge worker is dispatched every 10 seconds. Persistent per-feed **request-start** clocks gate actual requests, including manual `all` calls. A single session advisory lock prevents overlap. Subsecond cron jitter can wait up to one second inside the worker; slow requests, outages or scheduler delays may produce longer gaps. These are minimum spacings, not exact-delivery guarantees.

Each response loads only its referenced trip patterns and essential identity fields, rather than rereading the complete stop-time catalog every ten seconds. Each realtime attempt makes at most one upstream request. Network/5xx/429 failures persist exponential backoff, capped at five minutes unless Retry-After requires a longer pause. No short inline retry burst bypasses the confirmed spacing. Successfully parsed partial responses retain valid entities and safe rejection-reason counts. The last valid state survives failures. Overall feed health remains degraded for partial ingestion, but individually current predictions can still show a countdown with the partial-feed notice. Old predictions remain unusable by their own source clocks.

Browsers only read Supabase. Vehicles and health refresh every 10 seconds while visible, alerts every two minutes, and the route/stop catalog every five minutes; manual retry and visibility recovery refresh everything. Stop-arrival reads follow the arrival/static revision, rather than every vehicle update. Client count cannot increase upstream requests.

## Caching and capacity

Passio permits indefinite caching; ArchRide deliberately keeps bounded operational history. This permission does not authorize recording private rider location history. Current retention: vehicle observations 24 hours, observed stop events 14 days, job diagnostics seven days, prediction revisions **24 hours by default**, configurable with `transit_retention.prediction_hours` from 1–168 hours; walking entries retain their explicit expiry. Latest shared state is separate. Hourly cleanup also bounds this application's cron run logs to two days.

At a continuous 10-second dispatch, 30 days is approximately 259,200 Edge invocations plus daily static work, below the documented 500,000 Free-plan invocation allowance before other project/organization usage. Source ceilings are approximately 259,200 vehicle + 86,400 trip-update + 21,600 alert requests per 30 days, plus daily static fetches; skips reduce these counts. These are workload estimates, not a newly inferred provider quota. Check aggregate storage/egress/compute and other team functions before increasing retention. See [Supabase Edge pricing](https://supabase.com/docs/guides/functions/pricing).

## Deployment / recovery

Migration `passio_confirmed_polling` introduces private poll state, the configurable prediction retention, and the 10-second dispatcher. It deliberately leaves realtime cron paused until a compatible worker is deployed. Deployment order:

1. Pause `archride-realtime-refresh` with `cron.alter_job(..., active => false)`; let any existing worker finish.
2. Apply the checked-in migration, rebuild `pnpm transit:edge:build`, and deploy `index.ts`, generated `core.js`, and `deno.json` together.
3. Seed/synchronize poll start clocks conservatively from the last completed feed attempts, then enable the existing cron job. No Vault value is copied to client code or logs.
4. Verify feed-specific request-start spacing, accepted counts, source age, cooldown behavior, denied guest writes and worker HTTP 401 without a token. Keep static and retention cron jobs independent.

Rollback: pause realtime cron, retain the shared snapshots, and deploy a compatible fixed worker before re-enabling. Do not deploy the old all-feeds-per-minute worker under a 10-second schedule. Do not drop history or disable RLS to repair ingestion.

## Week 2 dependency ownership

The live GitHub Project was checked October 25: **Ivan (`IvanI2006`) owns task 5, Building-to-building planner and bus-versus-walking comparison**, currently shown as Todo. No planner branch or PR exists in the checked shared repository. Ask Ivan for his planner branch/PR, selected authorized walking provider, and complete verified journey-candidate interface. Share `UX-CONTRACT.md`, `JourneyCandidate`, `scheduledJourney`, `arriveBy`, and `DeadlineSearch` from the arrival-reliability PR. This task does not replace his planner with guessed walking distances.

Week 1's provider polling/cache gate is resolved. Week 2's independent arrival, deadline, evaluation and shared-consumer contracts are implemented. The actual planner integration remains blocked on Ivan's implementation. No verified source STOPPED_AT observations were available at the initial evaluation; caching permission and faster polling do not create ground truth. Keep the source baseline and uncertainty copy; do not fabricate calibrated windows, confidence scores or accuracy claims. The current aggregate evaluation is reproducible with `pnpm transit:evaluate` or `scripts/transit/evaluation-report.sql`.

## Verified evidence

[Hosted request-start samples](confirmed-cadence-evidence.json) recorded 33 vehicle requests (minimum 10.008s), 11 trip-update requests (minimum 30.008s) and two alert requests (120.654s apart), with no rejected entities in that sample. This verifies real scheduled ingestion, not just an installed cron entry. The later targeted-context optimization retains the same request-spacing code.

[Aggregate evaluation](../evidence/week-2-confirmed-policy-evaluation.json) records 3,211 captured revisions: zero verified matches, 810 stale-at-receipt revisions and 2,401 pending observations under the current 90-second policy. The report applies this operational cutoff uniformly to retained revisions, including those captured before the cadence change. Source failures remain in the independent seven-day attempt counts; neither a successful HTTP response nor an accepted row proves complete source coverage. Bias, error percentiles and calibrated intervals remain unavailable. The [hosted public smoke](hosted-public-smoke.json) passes against 19 routes and 161 stops, with denied guest writes/private reads and HTTP 401 for an unauthenticated worker call.

Validation: 50 unit/database tests, 118 desktop/mobile browser tests, lint, typecheck, production build, and the hosted public-access smoke check passed. The final private-table access assertions also passed in the focused cadence suite. Worker version 8 was verified healthy after deployment: successful vehicle and arrival ingestion, successful alerts, and no current realtime feed errors at 22:19 UTC on October 25. The committed cadence measurements above were collected on version 7; version 8 retains the same gates and narrows catalog reads.
