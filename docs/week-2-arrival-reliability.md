> **October 25 follow-up:** [Passio policy is now confirmed](transit/CONFIRMED_POLICY.md). Current arrival freshness is 90 seconds, and prediction history defaults to 24 hours. Historical measurements below describe the earlier run. Task 5 is assigned to Ivan (`IvanI2006`); its planner is still absent from the shared repo.

# Week 2: arrival interpretation and reliability handoff

Assignment: [project draft](https://github.com/users/nandanpraveen/projects/1/views/1?pane=issue&itemId=268072450), [requirements](backlog/06.md). Branch: `feature/arrival-reliability`.

## Delivered

- One clock-driven source arrival representation, explicit missing/stale/cancelled/passed states, source/received/validity timestamps and nullable countdown. Home and stop details share its display. Expiry works while the page remains open.
- Complete-journey deadline assessment and arrive-by candidate search. Deadline equality, user buffer equality, late, insufficient and expired live horizons have explicit behavior. America/New_York parsing rejects DST gaps and supports explicit fold choice; input requires an explicit choice for ambiguous local times rather than guessing.
- Published calendar/exception/service-time adapter with GTFS noon-minus-12h semantics, >24h times, loop occurrences, and verified pre/post walking plus boarding buffer. Unsupported frequency templates remain unsupported.
- Trusted immutable prediction revision capture in Supabase, replay-safe primary key `(id, update_timestamp)`, accepted revisions only, private grants/RLS, hourly seven-day retention. Existing worker and polling schedule unchanged. Migration applied as `20261025213033`.
- Reproducible aggregate report and matching evaluator. Exact instance/trip/stop/sequence and source STOPPED_AT evidence only; no proximity ground truth. Multiple matches are ambiguous; no convenient nearest-event selection. Missing observations remain pending for a documented one-hour grace period, then unmatched. All states remain in the denominator.
- [Shared behavior and tasks 5/9/10 integration contract](../UX-CONTRACT.md), with no persisted countdowns or inferred cancellation.

## Current measured evidence

[Aggregate report](evidence/week-2-arrival-evaluation.json), generated October 25 at 21:32 UTC: 189 captured revisions, **0 matched observations**, 189 pending, no error distribution or bias available. Source attempts retained independently: arrivals 4,026 success / 2,752 failed, vehicles 6,778 success. These include prior days and must not be confused with the two-minute capture window. Source failures are not removed to make coverage look better.

Observed one-day worker attempt cadence: median 59.98 seconds, p90 61.02 seconds. The existing 180-second freshness cap is three nominal polling opportunities; it is an operational stale cutoff, not a calibrated interval or confirmed provider quota. An accepted-row stale/missing rate of zero does **not** mean source completeness: rejected payloads/absent entities have no accepted prediction row. Source attempt counts expose that separate denominator. Neither missing events nor a passed prediction establishes actual bus arrival.

No arrival window, custom correction, confidence tier or accuracy claim is enabled. Route/hour aggregates require at least 30 distinct observed events. Even reaching that floor does not automatically enable calibration: independent held-out error/coverage analysis and team review are required. Revisions from one stop occurrence are correlated, and snapshot-weighted metrics must be interpreted accordingly.

## Reproduce

Trusted operator with a database connection (never a browser/service key in frontend):

```sh
TRANSIT_DATABASE_URL='postgresql://…' pnpm transit:evaluate > /tmp/arrival-evaluation.json
```

Alternatively execute `scripts/transit/evaluation-report.sql` through the connected Supabase SQL tool/editor. It exports aggregates only. The CLI uses a repeatable-read, read-only transaction; the SQL uses one statement snapshot. For fixture regression, `pnpm test:transit` runs the matching evaluator and real migration/trigger tests without external feeds.

Retention: predictions seven days by capture time, observed arrival events fourteen days under the existing policy, job attempts seven days. Reports describe retained evidence, not an all-time population. Re-run after real verified events exist; do not backfill predictions from current state after an observation.

## Integration dependency and acceptance

Task 5's complete-journey producer is not on current `main`; Plan still has no verified walking/provider candidates. `DeadlineSearch` accepts `JourneyCandidate[]`, `scheduledJourney` adapts the selected service/pattern/legs, and `arriveBy` ranks feasible candidates by latest origin departure. Wire that producer to the component when task 5 lands. The present Plan UI truthfully returns insufficient data. This dependency prevents claiming the student-facing journey recommendation flow is complete.

Active-trip/reminder features also do not yet exist on main; their shared contract is implemented/documented, but those future consumers must integrate it. Do not mark those end-to-end integrations complete until the consumers land.

Verification: desktop/mobile browser suite covers invalid deadline, unsupported future planning, clock expiry and existing public/auth/navigation behavior. Unit/database cases cover deadline/buffer boundaries, midnight/DST, supported calendar/exception services, repeated stop visits, missing/stale/ambiguous evidence and private replay-safe collection.

Static UI audit: existing MUI `Button component={Link}` links are falsely flagged as actionless; the pre-existing Profile form also lacks noValidate. These are recorded as existing audit limitations, not reported as a clean audit. New form owns validation. Material tokens remain unchanged; scoped shared-display change follows DESIGN.md's unknown-arrival/no-countdown rule.

Local validation completed with Node 24.22.0 / pnpm 12.5.1: lint and typecheck pass; 46 unit/database tests pass; the full existing/new browser suite passes (116 at the full run), with six focused desktop/mobile arrival tests passing after the added DST validation case. The seven arrival/deadline/database cases also pass with `TZ=Asia/Tokyo`. Production build passes after clearing the generated cache from an initial sandbox-only subprocess error. Browser plugin was unavailable; repository Playwright fixture servers were used at `127.0.0.1:3100`, desktop Chrome and Pixel 7. Screenshots outside the repository were inspected for Material consistency and narrow-screen layout. Supabase security advisors show no new findings after the explicit deny policy; the existing leaked-password-protection warning is unchanged. The new retention index is expected to remain unused until its first hourly cleanup.
