# Local acceptance evidence

Verified October 17, 2026 and rechecked on October 18 and October 19, 2026 using Node 24.22.0 and the project's pnpm 12.5.1.

| Check                                                                          | Result                                                           |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Frozen lockfile and dependency policy validation                               | Passed with pnpm 12.5.1                                          |
| Lint                                                                           | Passed                                                           |
| Next.js route type generation and TypeScript                                   | Passed                                                           |
| Transit tests                                                                  | 22 passed                                                        |
| Existing Playwright tests                                                      | 4 passed: desktop/mobile guest navigation and keyboard skip link |
| Production build                                                               | Passed, all routes compiled                                      |
| Patch whitespace check                                                         | Passed                                                           |
| Actual Passio static/realtime decoding, normalization, local insert and replay | Passed; see `access-evidence.json`                               |

The transit suite exercises the checked-in migrations in an isolated PGlite PostgreSQL engine: RLS/grants, denied writes/history reads, atomic rollback, duplicate replay, old feed/individual entity clocks, source cancellation, repeated loop stops, frequency instances, service times after midnight, partial outages, provider cooldown persistence, cleanup, and observed-stop transition deduplication. HTTP tests cover the actual health route and typed public read helpers with mocked Supabase responses; they do not simulate a hosted PostgREST deployment.

The production build needed network access for the starter's Google font and permission for Turbopack's local process port. It passed by invoking the same Next.js build entry point directly with Node 24 outside the restricted execution sandbox. Browser tests needed localhost/Chromium permissions and Playwright's matching Chromium download; after setup, `pnpm test` passed.

The final real-feed probe loaded 19 routes, 161 stops, 22 shapes, 6 service calendars, 229 trips, 4,351 stop occurrences and 90 frequency windows. All three realtime feeds imported and replayed with zero rejected entities. The probe used disposable local PostgreSQL, never hosted Supabase. It records real source timestamps/hashes/counts without checking raw bus snapshots into the repo.

The October 19 hosted checks now verify actual migrations/types, worker execution, identical-snapshot replay, overlapping real PostgreSQL sessions, public REST access/denial, ordinary authenticated SQL-role access/denial, Home search, and the production app health route. See `HOSTED_STATUS.md` and the hosted evidence JSON files. The installed realtime dispatcher was observed executing successfully without making HTTP requests while its approval gate is disabled.

Still pending: provider quota/permission confirmation, enabling and observing recurring realtime ingestion after that confirmation, merged Home/Map UI integration, and a verified building/entrance dataset if the team requires building search at this handoff. No source accuracy claim is made. The GitHub draft remains open.
