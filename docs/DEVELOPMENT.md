# Development and deployment

## Current scope

On November 3, 2026, the project owner removed student sign-up and sign-in. Accounts had been requested for rate limiting; backend admission now owns that protection. Personal travel data stays in browser storage. There is no student session, email confirmation, password reset, or cross-device sync in the app.

Existing Auth users and private tables are retained securely. Do not drop them to remove a frontend feature. Restricted maintenance uses authorized operator access, separately from the student app.

## Environment

Node.js 24 and pnpm 12.5.1 are pinned by the repository. Use `.env.example` for public configuration. Local secrets and `supabase/.temp/` are ignored. Never print or commit worker tokens, database passwords, administrator access tokens, or service-role keys.

The only backend in scope is ArchRide, `yivnryjbzhampecphlgr`, in US East/North Virginia. Do not change other Supabase projects.

Read `AGENTS.md` and relevant installed Next.js guides before implementation. This repository uses Next.js 16.4.3 static export, Material UI 9, and MapLibre. There is no production Next.js server. Privileged operations belong in Supabase Edge Functions and RLS-protected database code.

## Checks

Run the commands in the root README. Browser tests compile a static root-path export with test-only public configuration and serve it on port 3100 using Python. This avoids development hot reloads during interactions. Stop a development server using the same Next build directory first. Rebuild with `pnpm build:pages` after these tests to restore the real public configuration and production base path before deployment. After removing routes, remove stale generated Next type directories before `pnpm typecheck` if old route references persist. Do not remove source or user data to resolve generated-type errors.

`pnpm transit:edge:build` generates the ingestion worker, predictor core, and dataset module from shared sources. Commit those generated files together with their inputs; CI checks drift.

Tests exercise device persistence, timing, planner feasibility, source validity, parking rules/bounds, and database access controls. Test fixtures are not production transit data or evidence of prediction accuracy.

## Database changes

Discover CLI commands with `supabase --help` and the relevant subcommand's help. Inspect the linked schema before changing it. Create migration files with `supabase migration new`, test them against the isolated database, inspect the dry-run, apply to the authorized linked project, regenerate types, and rerun advisors. Keep ownership checks and explicit minimal grants on all exposed tables.

Public read endpoints must allowlist tables, columns, operators, query complexity, and response size. A publishable key, caller-supplied device ID, CORS policy, or hidden button is not an authorization or abuse-control boundary. Direct anonymous REST grants must not bypass the admission layer. Retain the upstream routing limiter and central ingestion cadence independently of visitor limits.

## Publish and roll back

1. Run the complete checks and build `pnpm build:pages` with the authorized public configuration.
2. Serve the exported files under `/archride/` and verify direct links, source reads, route requests, device storage, layout, and unavailable states.
3. Scan the export for secrets. Only public configuration belongs in browser assets.
4. In a clean checkout of `nandanpraveen.github.io`, replace only `archride/` with the verified export. Preserve root `index.html` and `resume.pdf`, and retain root `.nojekyll`.
5. Commit and push the generated site. Verify the HTTPS production URL after the Pages build completes.
6. To roll back the frontend, revert that site deployment commit. Backend migrations are additive and private historical data remains intact; never reset production tables as a deployment rollback.

Record the source commit, site commit, checks, health state, limitations, and rollback evidence in `docs/RELEASE.md`. Hardware smoke tests must be labeled separately from Chromium or WebKit emulation.
