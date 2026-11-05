# Static release checks

These tests use a standard Python HTTP server on `127.0.0.1:3300`, serving the built `out/` directory at `/archride/`. They do not start Next.js. Build only when the root-path browser tests have finished:

```sh
pnpm build:pages
pnpm exec playwright install chromium webkit
pnpm exec playwright test --config playwright.export.config.ts
```

The responsive matrix covers 320, 375, 768 and 1440 px, light and dark system themes, reduced motion, 150% base text, primary/secondary direct links, assets/base path, browser history and primary touch targets. A separate 375 px pass checks all seven student screens at 200% base text. Phone map checks also verify compact fixed-size bus glyphs, selected markers, and 44 px controls/touch targets. Full-page screenshots for Home, Plan, Parking and Profile at 375/1440 px are stored under `test-results/export/` and attached to results. Loading/skeleton states are allowed to settle before layout measurements. `test-results/export-results.json` records results and artifact paths.

`static-export.spec.ts` uses explicitly synthetic public catalog/walking fixtures to make UI and unavailable-data behavior repeatable. It verifies the device-only journey and confirms no private account-table requests occur. Removed account routes must return 404 or redirect to a useful account-free screen. A retained operations route cannot expose maintainer actions to a guest.

`real-public.spec.ts` leaves Supabase catalog and walking requests unmocked and completes a real MLC-to-Tate guest walking journey, including starting, leaving, resuming and ending it. Only map tile images are blocked to limit incidental tile traffic. It records observed time, actual selected public building names and API failures. The production Edge Function must allow the local QA origin; alternatively run against the published origin with `ARCHRIDE_EXPORT_BASE_URL=https://nandanpraveen.github.io`.

Chromium and WebKit runs establish browser-engine behavior under automated desktop/viewport testing. They do not establish a physical iPhone/Safari or Android acceptance result, prediction accuracy, parking authorization, or performance under an unmeasured traffic load. Inspect the screenshots and complete physical-device checks separately.
