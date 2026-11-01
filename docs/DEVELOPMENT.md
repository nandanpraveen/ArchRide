# Development notes

> **October 25 provider update:** [Confirmed Passio polling/cache policy](transit/CONFIRMED_POLICY.md) supersedes the temporary minute schedule and unknown-limit notes below. The current dispatcher runs every 10 seconds with independent 10/30/120-second feed gates and persisted backoff.

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

### Hosted migration reconciliation — November 1, 2026

All 10 checked-in migrations are recorded in ArchRide's hosted history. The previously hand-applied `20261030120000_classes` and `20261031120000_notifications` entries were reconciled after 227 schema/security comparisons matched an isolated database built from the repository. Only history metadata changed. There are no pending or untracked versions as of this verification; do not reapply either migration.

The hosted class and notification pgTAP suites passed all 26 permission checks using verified TLS. Test transactions, users, and the temporary pgTAP extension were rolled back. See [notification verification](week-3-leave-now-notifications.md#hosted-verification--november-1-2026) for coverage and browser fixture boundaries.

## Runtime boundaries

- `src/app/` owns Next.js routes. The five public starter pages are working navigation and honest empty states.
- `src/components/` owns shared Material UI shell/components; `src/theme.ts` and `DESIGN.md` define the visual system.
- `src/lib/supabase/` has typed browser/server clients and generated database types. `src/proxy.ts` refreshes sessions on saved/profile/auth paths. Authorization still belongs in server operations and RLS.
- `/api/health` checks the public `feed_status` table and returns 503 for missing configuration/unreachable data. A healthy database response still says `transit: not-connected` until task 2 is implemented.
- `tests/e2e/` checks guest navigation and keyboard skip links on mobile and desktop. Add feature-specific domain/security tests as real features are added.

The app uses source-provided transit data and exposes incomplete planning/personalized features honestly. A public production deployment remains a separate project task; hosted backend ingestion and the Auth integration are described below.

## Transit deployment update — October 19, 2026

The shared ArchRide project now includes the transit schema, authenticated `transit-ingest` Edge Function, hourly static due checks, hourly retention, and a configurable realtime cron dispatcher. Migration versions match the checked-in files. Do not reapply the schema under new names. See [hosted status](transit/HOSTED_STATUS.md) for exact versions and verification. Realtime was initially disabled; on October 21 the owner requested temporary activation on the existing minute schedule while provider limits remain unconfirmed. This operator authorization is not provider approval. Provider cooldown and overlap protection remain enabled.

The Edge Function uses the built-in server-side database connection and a dedicated Vault job token. No shared administrator password is needed in this checkout. Generate its core with `pnpm transit:edge:build`; CI checks that the generated file matches the shared TypeScript source. Keep `src/lib/campus-data.ts` when merging the Home branch: it replaces the teammate's placeholder using the existing interface. `pnpm db:types` remains the hosted type-generation command; `pnpm db:types:local` is an isolated development aid and cannot emulate hosted cron/Vault extensions.

## Week 1 integration

See `docs/integration-review.md` for the reviewed Home, Map and transit behavior and acceptance limits. Browser checks now use an isolated fixture server on port 3100; `pnpm test` never needs live provider access. Real Supabase public smoke is separate (`pnpm transit:hosted:smoke`). The integration production smoke used real hosted public data without enabling provider polling.

## Home data integration — October 21, 2026

Home now consumes abortable source-departure reads for a transient manual/GPS origin, separately from live-feed health. The shared public catalog contains reviewed UGA GIS building and door locations; see `docs/campus/README.md` for explicit operator refresh and source constraints. `pnpm campus:fetch --output /tmp/new-review-directory` generates review artifacts and never applies them. Apply reviewed SQL only to the linked ArchRide project. No RLS/schema changes or realtime polling activation are needed for this catalog.

## Authentication integration — October 24, 2026

PR #4 integrates email sign-up/sign-in, PKCE email confirmation, resend, password recovery/reset, server-validated Profile identity and sign-out. The shared Material shell, main landmark and public Home/Map/Plan/Saved browsing remain available without a guest cookie or Auth account. Private operations must continue to validate identity and use ownership RLS. No schema migration or new secret is required to pull this contribution.

After pulling main, run `pnpm install --frozen-lockfile` with Node 24 and pnpm 12.5.1. Next.js and its ESLint configuration are pinned to the patched 16.4.3 release. Keep the existing public project URL/publishable key in ignored `.env.local`; never distribute administrator credentials.

For each actual app origin, configure its exact `/auth/callback` and `/auth/callback?next=/reset-password` return URLs in Supabase Auth's redirect allowlist. Local development normally uses `http://localhost:3000`; loopback or alternate ports are distinct origins. Do not add broad production wildcards or assume that a new preview host is authorized. Confirmation links must be opened in the browser that initiated the PKCE request. Missing, expired or reused links lead to a recovery page, and callback destinations are checked against the app origin.

The hosted project's public Auth settings were checked: email sign-up is enabled, email confirmation is required, and anonymous Auth accounts are disabled. Automated Auth tests use a local protocol fixture and send no email. They exercise cookies, server verification, confirmation exchanges, sign-out and recovery independently of SMTP delivery; actual email delivery and each deployment's redirect allowlist must be checked for that environment. The existing security advisor also reports leaked-password protection disabled; Supabase makes that feature available on Pro and above, so it was not enabled by changing the project's Free plan.

The full Week 1 database/profile/preferences issue remains open: preference persistence/theme application, later-feature private tables, account deletion and their ownership/deletion acceptance tests were not supplied by this PR. Merging the authentication contribution does not mark those requirements complete.

### Week 2 arrival and reliability integration

See [arrival reliability handoff](week-2-arrival-reliability.md) and the root
[shared arrival/deadline contract](../UX-CONTRACT.md). Trusted aggregate reporting:
`TRANSIT_DATABASE_URL=… pnpm transit:evaluate`. Do not put privileged credentials
in public variables. Task 5 must supply complete verified journey candidates to
`DeadlineSearch`; the Plan fallback intentionally reports insufficient data until
that producer is connected. No calibrated accuracy claim is currently supported.
