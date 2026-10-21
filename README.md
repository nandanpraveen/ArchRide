# ArchRide

A mobile-first campus transit app for UGA students, built as a KTP pledge project with **Next.js, TypeScript, Material UI, Tailwind CSS, and Supabase**.

ArchRide will help a student choose between walking and a direct bus trip, identify the correct boarding stop/direction, and understand when to leave and whether a class deadline looks achievable. Home and Map use the shared public Supabase catalog for verified campus places, routes, stops, source predictions and alerts. The remaining planning and personalized features follow the project roadmap.

[GitHub project and draft issues](https://github.com/users/nandanpraveen/projects/1) · [Delivery plan](docs/ROADMAP.md) · [Full app brief](docs/APP_BRIEF.md) · [Design system](DESIGN.md) · [Development notes](docs/DEVELOPMENT.md)

## Start locally

Use Node.js 24 and pnpm 12.5.1. Dependencies and the public Supabase configuration are already set up on the bootstrap machine at `/Users/nandanpraveen/Documents/ArchRide`.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open [localhost:3000](http://localhost:3000). For a fresh clone, first copy `.env.example` to `.env.local` and obtain the ArchRide project URL and **publishable** key from the project owner or your authorized Supabase dashboard. Never put a secret/service-role key in a `NEXT_PUBLIC_` variable.

```sh
cp .env.example .env.local
```

The Material shell includes Home, Map, Plan, Saved, and Profile, responsive navigation and keyboard skip links. Home supports manual/GPS origins, destination selection, nearby stops and valid source departures. Plan preserves the chosen places while journey recommendations remain pending. Public browsing does not require location permission or an account.

## Check your work

```sh
pnpm lint
pnpm typecheck
pnpm test:transit
pnpm exec playwright install chromium # first test run on a new machine
pnpm test
pnpm build
```

`pnpm test` runs the desktop/mobile browser suite against an isolated fixture server on port 3100; it does not reuse a developer server or need shared secrets/provider access. `pnpm test:transit` exercises public read contracts, ingestion, catalog import and PostgreSQL security. CI also checks lint, types, the generated worker bundle and production build.

`GET /api/health` checks database connectivity and source-clock freshness separately. The database can be healthy while realtime transit is degraded; source predictions remain unavailable when stale or absent.

## Transit ingestion (Week 1)

See the [implementation, source evidence, team contracts, and activation runbook](docs/transit/README.md). Run `pnpm test:transit` for isolated PostgreSQL ingestion/security tests. The hosted ingestion function, static refresh, and retention jobs are deployed. Realtime refresh is temporarily enabled at the owner's request on the existing minute schedule; provider limits remain unconfirmed. Existing provider cooldowns remain enforced. See the runbook for verification and the rate-limiting follow-up.

## Backend

[ArchRide Supabase dashboard](https://supabase.com/dashboard/project/yivnryjbzhampecphlgr) · Free plan · US East/North Virginia.

The backend has typed browser/server Supabase clients, session-refresh support, private owner-only profiles, and deployed shared transit tables with public read-only access. A protected Edge Function performs central ingestion; hosted cron handles static refresh and retention. The full shared/private schema, Auth screens, ingestion, jobs, and admin features are scoped in the project. See [development notes](docs/DEVELOPMENT.md) for linking, migrations, type generation, and optional local Docker workflows.

## Campus places and Home data

The reviewed hosted catalog includes 354 buildings and 86 mapped automatic-door points from official UGA GIS sources, alongside the transit stop catalog. See [Home integration and acceptance](docs/home-data-integration.md) and [campus source/import runbook](docs/campus/README.md). Campus locations use UGA Office of University Architects attribution; transit keeps its UGA/Passio attribution. GPS coordinates stay only in Home memory. Automatic doors do not establish accessible walking routes.
