# Ponytail Audit — November 4, 2026

Read-only whole-repository complexity audit, followed by owner-authorized cleanup.

- `delete:` obsolete reminder-sync helper/type and its test-only harness. Runtime uses `reminderJobs`; retained date/DST and actual foreground reminder checks. `src/lib/class-reminders.ts`, `tests/classes/reminders.test.ts`.
- `delete:` unused Tailwind toolchain and directives. Existing Material UI theme, CssBaseline and custom CSS cover rendered styles. Removed two direct dependencies and 33 installed packages. `src/app/globals.css`, `next.config.ts`, `package.json`.
- `delete:` unused class validation exports; kept the validation enforced by `validateClass`. `src/lib/classes.ts`.
- `delete:` uncalled `homePlaceHref`. `src/components/home-journey.ts`.
- `shrink:` duplicate Home distance formula; reused existing `haversineMeters`. `src/components/home-journey.ts`, `src/lib/planner/planner.ts`.

All five findings applied. About 145 source/test/configuration lines and two direct dependencies removed. Separately removed the unused GTFS generator dependency (37 installed packages) and obsolete student account code after the owner's scope change. Trust-boundary validation, rate limits, source clocks, parking rules and requested user features remain covered by functional tests.

## Final redesign pass — November 5

`delete:` Removed the orphaned 33-line `EmptyState` component after the simpler page layouts replaced all callers. Final review found no further high-value dependency or abstraction cuts. The redesigned shell also removes the sidebar promotion and repeated interface copy without adding dependencies.
