# Rate-limit review — October 21, 2026

The reminder was delivered once and paused at the user's request. This is a read-only review: no application code or polling configuration was changed for this follow-up, and nobody was contacted. The previously tested Home integration is being published separately.

## Existing controls

- One hosted cron dispatcher runs each minute. Its 30-second minimum interval prevents duplicate dispatch within that interval; it is not evidence of a provider-approved quota. Other pollers must remain disabled.
- Three realtime feeds are fetched centrally, independent of visitor count. The baseline is three provider requests per minute, approximately 129,600 per 30 days, plus daily static requests and bounded retries. This is a workload estimate, not a permitted allowance.
- HTTP 429/5xx responses respect `Retry-After`, with at most three attempts, request timeouts and response-size bounds. Long waits are persisted as per-feed cooldowns. A database advisory lock prevents overlapping ingestion. These controls remain in place.
- Public pages read Supabase, not Passio. The visible-page snapshot refreshes every 60 seconds and makes five reads. Home can additionally read up to three stops and trip metadata when its source clock changes. Place search debounces for 300 ms, cancels superseded reads and normally makes four public reads; larger catalogs paginate with explicit bounds. Manual refreshes and direct public REST requests have no app-owned per-client request budget.
- Debouncing, aborts and result caps reduce ordinary work but do not enforce a server-side quota. Guest read-only RLS controls writes and private access; it is not a rate limiter.

## Provider terms: confirmed versus outstanding

The supplied team source document reproduces a Passio email to Jadon providing the UGA GTFS endpoints and stating that static data should be downloaded once every 24 hours. Team records call for Passio credit and noncommercial use. The app preserves separate UGA/Passio transit attribution and UGA GIS campus attribution.

Passio's public [GTFS integration article](https://passiotech.com/blog/clients-can-use-data-from-our-system-for-other-apps/) supports transit-agency integration with other applications. At this review it gives no numeric realtime request interval/quota, cache/history retention allowance or app-specific attribution contract. It does not confirm these outstanding terms for ArchRide. A reachable public endpoint and successful scheduled requests do not establish unlimited usage.

Still unconfirmed: permitted realtime polling interval, burst/monthly quota, caching and historical retention, redistribution/deployment permission and required attribution placement. The existing one-minute operator configuration was explicitly requested by the user without that provider confirmation. No confirmation has been fabricated or inferred from GTFS producer best practices.

## Deferred implementation

Before broader release, obtain and record the actual provider terms, then choose the central ingestion budget and cadence accordingly. Review catalog caching to avoid downloading unchanged places on each search, and enforce any needed public-read budget at a boundary that also covers direct Supabase REST access; a UI-only limit can be bypassed. Measure provider requests/retries, public reads/egress, 429s and cooldowns before choosing limits. Preserve public guest browsing, source freshness, provider backoff and overlap protection.

See [activation evidence](../campus/evidence/live-polling-status.json) and the [later readback](../campus/evidence/live-polling-followup.json). The first two scheduled runs succeeded. At the later readback vehicles and alerts were healthy, while arrivals reported `partial_rejection` and retained an older success clock. Accepted current predictions must still pass their individual validity checks; a healthy scheduler is not a guarantee of a complete arrival feed.
