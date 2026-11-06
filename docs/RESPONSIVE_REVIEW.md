# Responsive workspace review — November 6, 2026

The desktop shell now uses the window width. Home places a bounded trip form and nearby departures beside an expanding map and personal shortcuts. Plan separates the form, map and results; Map gives geography the remaining width beside a readable directory. Saved journeys and stops share a row when both groups exist. Settings and reading pages remain centered and bounded.

Phones retain five labeled navigation destinations and one content column. Home and Plan avoid mounting the map renderer below 900 px. Trip results precede the edit form, selected map details have an explicit anchor, and Undo clears the bottom navigation on both phones and tablets. Page padding includes the bottom safe area. Input focus uses MUI's outlined field treatment without a second outline inside it.

## Verification

- Lint with zero warnings, TypeScript, and the production `/archride` static build.
- 182 unit/database checks covering transit, classes, notifications, planning, personal data, and parking.
- 156 functional browser checks on desktop and phone layouts.
- 50 production-path Chromium/WebKit checks, including direct URLs, complete synthetic and real public walking journeys, offline/error behavior, both themes, reduced motion, enlarged text, and responsive layouts from 320 to 2560 px. The new workspace cases check column geometry, 200% base text, phone edit anchors, map loading, selected details, saved-group layout, and Undo at 320 and 768 px.
- An axe-core WCAG A/AA scan of all eight student pages at 375 and 1440 px in both themes: 32 page/theme/viewport combinations, no reported violations. This is automated coverage, not a complete accessibility certification.
- Visual review of populated/empty Home, Plan and Profile layouts, including tablet, wide desktop, light and dark states.
- Production dependency audit: no known vulnerabilities. Source/public/export scan: no secret keys or service-role JWTs.

## Backend verification

The hosted smoke script now uses the same bounded public proxy as the app. It checks current route/stop access and campus search, rejects direct Data API bypass and private reads on ten tables, and verifies private-query, relation-embedding, excessive-limit, mutation, untrusted-origin and unauthenticated maintenance rejection. It also checks public health. The run modifies no records and reads no administrator credential.

[Hosted smoke evidence](evidence/hosted-public-security.json) and [verification summary](evidence/responsive-workspace-review.json) record this review. The hosted security advisor found no public tables without RLS. Its one existing warning is [disabled leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Student accounts are absent from the current app; no plan or authentication configuration was changed.

Re-run the hosted checks with `pnpm transit:hosted:smoke` using authorized public configuration in `.env.local`. Run `pnpm test`, then `pnpm build:pages` and `pnpm test:export` for the compiled browser checks. The unit suites and other checks remain listed in the root README.

These changes were verified locally and committed for review. They have not been published. No physical iPhone/Android or student usability acceptance is inferred from browser emulation, and synthetic transit fixtures do not establish ETA accuracy.
