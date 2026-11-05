# ArchRide

[Open ArchRide](https://nandanpraveen.github.io/archride/)

A student-built UGA campus travel app for desktop and mobile browsers. Compare verified walking paths with reachable direct bus journeys, find boarding stops and campus parking, and plan around classes.

**No account is required.** Saved journeys, classes, preferences, active trips, and reminders stay in the current browser. They do not sync across devices. Backend request limits protect shared services without student accounts.

[Project board](https://github.com/users/nandanpraveen/projects/1) · [Release verification](docs/RELEASE.md) · [Development](docs/DEVELOPMENT.md) · [Design](DESIGN.md) · [Parking sources and audit](docs/parking/README.md)

## Run locally

Use Node.js 24 and pnpm 12.5.1. Python 3 serves static files during browser tests.

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the authorized ArchRide project configuration. These values are public client configuration. Never put a secret or service-role key in a `NEXT_PUBLIC_` variable.

Open [localhost:3000](http://localhost:3000). Public campus reads and walking requests use deployed Supabase Edge Functions. The site itself exports to static files for GitHub Pages.

## Features

- Home search, manual or optional GPS origins, nearby departures, saved shortcuts, and next-class planning.
- Complete walking and direct-bus comparisons with boarding direction, walking legs, safety buffers, and campus-time deadlines.
- Active-trip steps, current-source revalidation, missed-bus recovery, and clearly separated agency and maintainer notices.
- Guest parking maps and searchable lists with sourced rules, explicit unknown conditions, and a geographic three-mile campus buffer.
- Device-local saved trips, classes, appearance, quiet hours, watched buses, and in-app notification history.

Transit and walking times are estimates. Missing or expired source information has no live countdown. Reminders require the app to remain open; background push is not enabled. Parking information never replaces posted signs or TPS event rules. Student accounts and email delivery are outside the current scope.

The adaptive-prediction pipeline remains evidence-gated. Official predictions remain the serving baseline; replay tests alone do not establish improved accuracy. See the release evidence for current coverage and limits.

## Verify

```sh
pnpm lint
pnpm typecheck
pnpm test:transit
pnpm test:classes
pnpm test:notifications
pnpm test:planner
pnpm test:personal
pnpm test:parking
pnpm test
pnpm build:pages
pnpm test:export
```

Browser tests build a static export with deterministic test data and serve it on port 3100. Run `pnpm build:pages` afterward before publishing. Live backend and static-export checks are recorded separately in [release verification](docs/RELEASE.md). Tests do not send email or use private student accounts.

## Deployment

`pnpm build:pages` exports the app with `/archride` as its base path. Publish only the contents of `out/` into `archride/` in the existing `nandanpraveen.github.io` repository. Preserve the portfolio and resume at the repository root. The root `.nojekyll` file keeps `_next` assets available.

Supabase hosts central ingestion, public read admission, walking routing, optional rider reports, health checks, and restricted maintenance. Browser code contains no worker or administrator secret. Existing private database records are retained under their ownership policies; removing student sign-in does not delete historical records.

ArchRide is not affiliated with or endorsed by the University of Georgia. Transit: UGA / Passio. Campus geometry: UGA Office of University Architects. Maps and walking paths: OpenStreetMap contributors / FOSSGIS.
