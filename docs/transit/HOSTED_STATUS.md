# Hosted acceptance record — October 19, 2026

Project: ArchRide (`yivnryjbzhampecphlgr`). Work remains on `feature/transit-ingestion`; no direct commit or merge to `main` is required for review.

## Deployed and verified

| Deliverable                              | Evidence                                                                                                                                                                                 |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared transit schema and access control | Hosted migrations `20261019234255`, `20261019234502`, `20261019235421`; generated types read from the hosted project                                                                     |
| Real central ingestion                   | 19 routes, 161 stops, 11 vehicles and 166 arrival rows at the initial successful hosted acceptance run; source counts change with service                                                |
| Shared vehicle/trip identity             | Real Passio duplicate trip/date/start tuples across vehicles reproduced and regression-tested; vehicle identity now disambiguates predictions                                            |
| Replay safety                            | HTTP 200 with `replayVerified=true`; identical normalized snapshots left latest-state, observations, arrivals and stop-event counts unchanged                                            |
| Overlap prevention                       | Concurrent requests 5 and 6 returned `success` and `overlap_skipped` using a real PostgreSQL session advisory lock                                                                       |
| Public/private authorization             | Anonymous REST reads succeed; inserts/updates/deletes and history/config reads are denied. Both `anon` and ordinary `authenticated` SQL roles passed actual read/write-denial assertions |
| Worker authentication                    | Unauthenticated invocation returns 401; a dedicated Vault token is required. No secret is in the repo or public client                                                                   |
| Retention                                | Hourly database maintenance is independent of upstream polling; configurable history/job/cache cleanup is deployed                                                                       |
| Security advisors                        | No findings after explicit deny policies and missing source-ID indexes were added                                                                                                        |
| Performance advisors                     | Only informational unused-index notices on the newly deployed schema; indexes retained for intended queries/constraints                                                                  |
| Home team handoff                        | Exact existing `searchPlaces` interface implemented in `src/lib/campus-data.ts`; hosted search tested with real stop data                                                                |
| App integration check                    | `/api/health` uses actual hosted feed freshness; stale status is expected while realtime polling is paused                                                                               |

## Active job behavior

- `archride-static-refresh`: hourly due check at minute 17; no HTTP request while static data is less than 24 hours old or the provider cooldown is active.
- `archride-transit-retention`: hourly cleanup at minute 43; no upstream request.
- `archride-realtime-refresh`: minute dispatcher installed, but `realtime_enabled=false`. A live check of the dispatcher returned null and made no HTTP request. An installed cron entry must not be confused with enabled realtime ingestion.

The team explicitly reported no confirmed realtime limit. No automatic realtime polling has been enabled. Controlled acceptance runs established functionality, not quota approval or prediction accuracy.

## Complete the remaining external gate

Have Jadon/the provider contact confirm permitted caching/redistribution, attribution, realtime interval and quota. Suggested request (not sent automatically):

> We are building the non-commercial student UGA tracker using the GTFS feeds supplied to our team. We credit UGA and Passio. Could you confirm the permitted realtime polling interval, request quota, caching/history limits and attribution requirements? We have one central importer and fetch static GTFS no more than once per 24 hours.

After recording the actual provider response, an authorized operator can enable realtime. Replace the illustrative interval/evidence below with the confirmed values; do not run it as approval evidence itself:

```sql
update archride_private.transit_job_config
set approved_interval_seconds = 60,
    rate_evidence = 'Actual provider confirmation, date and team record reference',
    realtime_enabled = true
where id;
```

The existing cron checks once per minute and enforces any longer interval. An approved 30-second maximum request rate does not require polling every 30 seconds; polling more slowly is allowed by the rate gate. Change the cron cadence only if the team needs finer updates and the confirmed quota permits it. Observe one successful scheduled run and frontend freshness before closing the task.

Keep the GitHub draft open until the provider gate and Home/Map branch integration are verified. Building/entrance storage is ready but intentionally unpopulated without a verified campus dataset. The Home adapter searches the verified stop catalog and returns honest unavailable/empty states rather than invented buildings or ETAs.

## Operations and rollback

Pause realtime with `update archride_private.transit_job_config set realtime_enabled=false where id;`. This leaves static refresh and cleanup running. To pause all upstream ingestion, also set `public.transit_sources.enabled=false` for `uga-passio`; cleanup can continue. Keep the last good snapshot and its original timestamps. Do not disable RLS, expose worker credentials, reset the database, or enable both the Actions and hosted pollers as an outage workaround.

For a manual authorized smoke run, use `select archride_private.dispatch_transit('all');` and inspect safe results in `net._http_response` and `public.transit_job_runs`. Avoid repeated manual polling. Never select or paste the job token. The project URL and hash are configuration; the raw token remains only in Vault and the outgoing trusted request.
