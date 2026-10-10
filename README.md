# ArchRide

A mobile-first campus transit app for UGA students, built as a KTP pledge project with **Next.js, TypeScript, Material UI, Tailwind CSS, and Supabase**.

ArchRide will help a student choose between walking and a direct bus trip, identify the correct boarding stop/direction, and understand when to leave and whether a class deadline looks achievable. The repository currently contains the **development starter**; the full app is the twelve-task team project.

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

The Material shell includes Home, Map, Plan, Saved, and Profile, responsive bottom/rail navigation, accessible focus and skip links, and honest empty states. Live transit and personalized features are implemented through the project drafts. Location and an account will not be required for public transit browsing.

## Check your work

```sh
pnpm lint
pnpm typecheck
pnpm exec playwright install chromium # first test run on a new machine
pnpm test
pnpm build
```

`pnpm test` runs the desktop/mobile browser suite on port 3000. Locally it reuses your running development server or starts one when needed; CI always starts a fresh server. `pnpm test:e2e` is an alias. CI runs lint, type checks, a production build, and browser tests for pushes and pull requests. Tests do not need shared Supabase secrets.

`GET /api/health` checks database connectivity. With the configured starter database it reports `status: ok`, `database: connected`, and `transit: not-connected`; it does not claim a live transit feed.

## Backend

[ArchRide Supabase dashboard](https://supabase.com/dashboard/project/yivnryjbzhampecphlgr) · Free plan · US East/North Virginia.

The starter has typed browser/server Supabase clients, session-refresh support, two applied migrations, public read-only feed health, and private owner-only profiles. The full shared/private schema, Auth screens, ingestion, jobs, and admin features are scoped in the project. See [development notes](docs/DEVELOPMENT.md) for linking, migrations, type generation, and optional local Docker workflows.
