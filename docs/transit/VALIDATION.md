# Local acceptance evidence

Verified October 17, 2026 and rechecked on October 18, 2026 using Node 24.22.0 and the project's pnpm 12.5.1.

| Check | Result |
| --- | --- |
| Frozen lockfile and dependency policy validation | Passed with pnpm 12.5.1 |
| Lint | Passed |
| Next.js route type generation and TypeScript | Passed |
| Transit tests | 20 passed |
| Existing Playwright tests | 4 passed: desktop/mobile guest navigation and keyboard skip link |
| Production build | Passed, all routes compiled |
| Patch whitespace check | Passed |
| Actual Passio static/realtime decoding, normalization, local insert and replay | Passed; see `access-evidence.json` |

The transit suite exercises the checked-in migrations in an isolated PGlite PostgreSQL engine: RLS/grants, denied writes/history reads, atomic rollback, duplicate replay, old feed/individual entity clocks, source cancellation, repeated loop stops, frequency instances, service times after midnight, partial outages, provider cooldown persistence, cleanup, and observed-stop transition deduplication. HTTP tests cover the actual health route and typed public read helpers with mocked Supabase responses; they do not simulate a hosted PostgREST deployment.

The production build needed network access for the starter's Google font and permission for Turbopack's local process port. It passed by invoking the same Next.js build entry point directly with Node 24 outside the restricted execution sandbox. Browser tests needed localhost/Chromium permissions and Playwright's matching Chromium download; after setup, `pnpm test` passed.

The final real-feed probe loaded 19 routes, 161 stops, 22 shapes, 6 service calendars, 229 trips, 4,351 stop occurrences and 90 frequency windows. All three realtime feeds imported and replayed with zero rejected entities. The probe used disposable local PostgreSQL, never hosted Supabase. It records real source timestamps/hashes/counts without checking raw bus snapshots into the repo.

Not verified here: hosted migrations and generated types, a production database/worker connection, scheduler overlap across real PostgreSQL sessions, sustained provider quotas, production RLS through PostgREST, live Home/Map integration, or campus building/entrance accuracy. These remain explicit acceptance gates in the activation runbook. The GitHub draft was not modified or marked complete.
