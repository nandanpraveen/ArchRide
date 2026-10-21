# Development notes

## Environment

Use Node.js 24 and pnpm 12.5.1 (pinned in `package.json`). The bootstrap machine already has Node, pnpm, Git, GitHub CLI, Supabase CLI, installed packages, and Playwright Chromium.

The connected Supabase project is **ArchRide**, ref `yivnryjbzhampecphlgr`, Free plan, US East/North Virginia. `curanew-dev` was paused to free an active-project slot. No existing Supabase project was deleted. Do not pause, restore, or change unrelated projects as part of ordinary ArchRide development.

`.env.local` on the bootstrap machine contains only the project URL and publishable key and is ignored by Git. The initial database password is stored separately at `.secrets/supabase-db-password` with owner-only permissions. Never commit it or share it in chat/issues. Teammates should use their own authorized Supabase access rather than receiving shared administrator credentials.

## Database workflow

The starter migrations are already applied to the hosted project. They create public read-only `feed_status` and private owner-only `profiles`, with explicit grants, RLS, and Auth-user deletion cascades. They do not implement the full transit model or account UI; tasks 2 and 3 own those features.

Use the installed CLI's `--help` before unfamiliar commands. On a new machine, authenticate and link your authorized project:

```sh
supabase login
supabase link --project-ref yivnryjbzhampecphlgr
supabase migration new descriptive_change
```

Review migrations before applying them. Prefer an isolated local stack for schema experiments. Docker is needed for `supabase start` and some diff/catalog workflows; it is not needed to run this Next.js starter against the hosted project. The bootstrap machine's Docker daemon was not running, so a full local Supabase stack was not started. Hosted migration push and generated types were verified successfully.

```sh
supabase db push --linked --dry-run
supabase db push --linked
pnpm db:types
supabase db advisors --linked --type all
```

Never modify an already-applied migration to change a hosted schema. Add a migration. Enable RLS on exposed tables, explicitly grant only intended operations, and test private ownership across two users when implementing personal features. New jobs use server-only secrets; clients use publishable keys.

## Runtime boundaries

- `src/app/` owns Next.js routes. The five public starter pages are working navigation and honest empty states.
- `src/components/` owns shared Material UI shell/components; `src/theme.ts` and `DESIGN.md` define the visual system.
- `src/lib/supabase/` has typed browser/server clients and generated database types. `src/proxy.ts` refreshes sessions on saved/profile/auth paths. Authorization still belongs in server operations and RLS.
- `/api/health` checks the public `feed_status` table and returns 503 for missing configuration/unreachable data. A healthy database response still says `transit: not-connected` until task 2 is implemented.
- `tests/e2e/` checks guest navigation and keyboard skip links on mobile and desktop. Add feature-specific domain/security tests as real features are added.

The starter intentionally does not contain demo buses, guessed arrival times, production ingestion jobs, a finished login form, or a deployed production app. Those are owned by the twelve project drafts.

## Transit deployment update — October 19, 2026

The shared ArchRide project now includes the transit schema, authenticated `transit-ingest` Edge Function, hourly static due checks, hourly retention, and a gated realtime cron dispatcher. Migration versions match the checked-in files. Do not reapply the schema under new names. See [hosted status](transit/HOSTED_STATUS.md) for exact versions and verification. Realtime polling is disabled pending provider rate confirmation.

The Edge Function uses the built-in server-side database connection and a dedicated Vault job token. No shared administrator password is needed in this checkout. Generate its core with `pnpm transit:edge:build`; CI checks that the generated file matches the shared TypeScript source. Keep `src/lib/campus-data.ts` when merging the Home branch: it replaces the teammate's placeholder using the existing interface. `pnpm db:types` remains the hosted type-generation command; `pnpm db:types:local` is an isolated development aid and cannot emulate hosted cron/Vault extensions.
