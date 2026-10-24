# Week 1 contribution integration review

This records the initial merge review. The October 21 [Home data follow-up](home-data-integration.md) supersedes its empty building catalog and Home-departure limitations.

Reviewed on October 20, 2026 (America/New_York), against the four Week 1 drafts in the [ArchRide project](https://github.com/users/nandanpraveen/projects/1).

| Contribution | Review and integration |
| --- | --- |
| [Home/search #1](https://github.com/nandanpraveen/ArchRide/pull/1), Alethea | Retained the real search adapter from ingestion; connected catalog/freshness/alerts, usable GPS/manual fallback, stable duplicate identities, cancellation, retry, and selected-place navigation. |
| [Transit ingestion #2](https://github.com/nandanpraveen/ArchRide/pull/2), Varun | Resolved dependency/lock conflicts with the existing map, fixed optional GTFS columns with a regression, rebuilt the Edge bundle, and merged after local checks and GitHub CI passed. |
| [Map #3](https://github.com/nandanpraveen/ArchRide/pull/3), Ivan | Already merged before review. Connected source routes, patterns, shapes, ordered stop occurrences, valid arrivals and vehicles; added deep links, accessible directories, WebGL/tile fallback, source freshness and linked attribution. |
| Auth/profile, Jadon | Incomplete; its branch and private feature work were not merged or changed. |

## Corrections made during review

- Home and Map no longer permanently claim disconnected transit after a successful catalog import. Missing or stale live data remains explicit.
- Search results open actual place/stop details; selected places remain visible when opening Plan. The trip planner itself remains a later task.
- Search clears old hits immediately, cancels superseded requests, keys duplicate names by type and ID, and exposes a usable retry control.
- GPS is opt-in and kept in page memory. Nearby-stop distances are explicitly approximate straight-line distances, never walking routes or an official campus boundary.
- Route patterns preserve repeated visits to one physical stop. Only source-provided geometry is drawn; stale/cancelled/expired predictions are excluded.
- Public browser reads share a publishable-key client with no Auth session. Snapshot/search requests are bounded, old data is retained after refresh failures, and snapshot refresh pauses while the page is hidden.
- MapLibre is pinned to the copied worker version. Vendor minified code is excluded from application linting.
- Browser tests start an isolated server on port 3100 with synthetic public configuration and intercepted data; they never rely on provider availability or a developer's running server.

## Validation

- `pnpm install --frozen-lockfile`
- `pnpm lint` and `pnpm typecheck`
- `pnpm transit:edge:build` with no generated-bundle drift
- `pnpm test:transit`: ingestion, migrations/RLS, replay, outages, freshness and alert-period checks
- `pnpm build`
- `pnpm test`: 40 desktop/mobile browser checks, including duplicate search results, stale responses, source failure/retry, GPS opt-in/failures, source arrivals, repeated stops, invalid deep links, WebGL failure, keyboard navigation and 320 px layout
- Real hosted public smoke: 19 routes and 161 stops; anonymous writes and private reads denied; unauthenticated worker returns 401
- Hosted migration history matches all five local migration versions; current security advisor reports no findings
- Local production build using real hosted public data: search and stop details, route boarding order, selected Plan context and narrow layout pass with no page exceptions. See `integration-live-smoke.json`.

## Remaining acceptance limits

Merging these contributions does not complete the whole app or close all project acceptance gates. Realtime provider polling remains disabled until its permitted quota/interval is confirmed. Old realtime positions and arrivals are shown as stale or unavailable. The verified building/entrance catalog has no production data yet. Auth/profile, saved journeys, classes, walking-based trip planning, reminders, parking/bounds and production release remain with their project owners and later tasks.

No hosted schema, polling configuration, or deployed Edge Function was changed during this review. The rebuilt worker fix is committed for the next reviewed deployment. The live smoke used a local production Next.js server, not a public production deployment. No project draft was marked Done based only on a merge or passing fixture tests.

Map tiles use the existing OpenStreetMap raster service, visible linked attribution, normal browser caching, and no prefetch/offline-download features. It is a best-effort service; keep the accessible directory usable during tile failures and review [the tile policy](https://operations.osmfoundation.org/policies/tiles/) before changing traffic or hosting.
