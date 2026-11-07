# ArchRide release verification

## Scope and source of truth

Reviewed all 14 items in [GitHub Projects](https://github.com/users/nandanpraveen/projects/1), including the parking addition and [adaptive-prediction issue 10](https://github.com/nandanpraveen/ArchRide/issues/10). Board status is not treated as proof of acceptance.

On November 3, 2026 the owner explicitly removed student sign-in/sign-up, requested backend rate limiting, and retained the final Ponytail Audit/cleanup requirement. Student personal-data features now use device storage. Historical account requirements in the board and older evidence are superseded for the student app; existing database records are preserved.

## Requirement-to-evidence ledger

| Board item | Implementation and verification |
| --- | --- |
| Material shell, Home and search | Responsive Material navigation, keyboard search, optional GPS/manual origins, source states and next-trip entry. Home, navigation and export browser suites. |
| Central transit ingestion | Authorized Passio source with independent 10/30/120-second gates, persisted cooldown/backoff, bounded requests, retained partial snapshots and cleanup. Transit unit/database tests and hosted health. |
| Private database, Auth, preferences | Student Auth removed at the owner's request. Device-only preferences/appearance and data-clearing UI; historical private rows retain RLS. Backend admission replaces Auth as request protection. |
| Live map and boarding details | Route patterns, stop occurrences, vehicle freshness, searchable/list alternatives, detail links and directions. Map/export browser suites. |
| Complete journey planner | Verified walking legs, reachable direct buses, total destination arrival and provenance. Planner unit/browser tests and a separate real-public walking smoke. |
| Arrival/deadline reliability | Source-clock expiry, cancellation/missing distinctions, complete-journey deadlines, campus timezone and explicit repeated DST hour. Controlled-clock unit/browser checks. No calibrated accuracy claim. |
| Saved journeys and favorites | Device-local named/reordered items, stop integration, fresh replanning and undo. Saved/device browser tests. No cloud sync. |
| Weekly classes | Device-local recurring schedule, next-class entry, retired-building recovery and reminder integration. Classes unit/browser suites. |
| Active trips and recovery | Exact instance and stop-occurrence revalidation, explicit progress, current destination timing, stale/cancelled states, missed-bus recovery and watch cleanup. Active unit/planner browser tests. |
| Reminders and notifications | Device-local preferences/history/read/clear, quiet hours, bounded dedupe, foreground delivery and cross-tab updates. Notification unit/device/browser tests. Background push is unavailable. |
| Restricted operations | Server-validated trusted maintainer operations, time-scoped notices, audited source-preserving corrections, bounded retry and health/evaluation. Protected operator API; no student admin login. Hosted security and database checks. |
| Campus parking and map bounds | 88 reconciled areas covering 81 TPS enforcement codes plus 7 mapped areas. Typed checked-in inventory, source audit, unknown/conflicting rules, accessible directory and shared geographic camera constraint. Parking unit/browser tests and geodesic verification. |
| Production ship gate | Static export under exact lowercase/archride path; final automated, visual, live and deployment checks recorded below. Physical-device checks remain a separate evidence requirement. |
| Adaptive prediction | Opt-in validated reporting, independently observed data, reproducible versioned evaluation and promotion gates. Official predictions remain active. Independent departure/dwell evidence and later held-out end-to-end arrival improvement remain prerequisites for broader model activation. |

## Council findings applied

All five independent advisors and five anonymous peer reviews converged on proving a complete student journey rather than trusting Done labels. The design centers destination choice and full travel timing. Static hosting constraints, precise boarding identity, source validity, parking conflicts, privacy and direct endpoint security are release concerns.

The reviewers also identified missing operational budgets, email readiness, rollback and physical-device evidence. Removing student accounts resolves the email dependency. Rate limits remain server-enforced; source quotas remain independent. The existing portfolio repository is preserved, with deployment restricted to a new archride directory.

## Verification record

The November 6 responsive workspace update is deployed at the existing ArchRide URL after [PR #16](https://github.com/nandanpraveen/ArchRide/pull/16) passed GitHub CI and merged. All 50 production-path Chromium/WebKit checks passed on the live site. The [responsive review](RESPONSIVE_REVIEW.md), [deployment evidence](evidence/responsive-deployment.json), and [rollback drill](evidence/responsive-rollback.json) record the source/site commits, byte-for-byte portfolio preservation, retained assets, and verification. The November 5 release evidence below remains the historical baseline.

The November 5 release uses a simpler header, open trip form, compact rows, disclosure controls for supporting text, and fixed-size SVG bus markers. Phone Home does not load the map renderer. Transit and Parking start with separate map layers. Safari trip actions keep their width during pointer focus.

- 182 unit/database checks passed (58 transit and 124 classes/notifications/planner/personal/parking checks).
- 156 functional browser checks passed against the compiled static app on desktop and phone viewports; 26 map/parking/navigation checks passed after the marker changes.
- The final production-path Chromium/WebKit suite covers direct URLs, assets, history, account-free use, offline parking, 320–1440 px, both themes, reduced motion, 150% text, every student screen at 200% text, and fixed marker/control sizes. It also completes real public MLC-to-Tate walking journeys in both engines. See [browser evidence](evidence/browser-release.json).
- Lint with zero warnings, TypeScript and production static build passed. The production dependency audit reported zero known vulnerabilities. [Secret scan](evidence/export-security.json) found no secret keys or service-role JWTs in source/export; 609 historical text blobs were checked previously.
- [Final anonymous security smoke](evidence/production-anonymous-smoke.json): 19 hosted checks covering admission, direct-REST bypass prevention, private-table rejection, spoof resistance, 429 recovery, reporting and shared concurrency limits.
- [Hosted health](evidence/release-health.json) and [overnight operations](evidence/release-operations-status.json): all four feeds current, all 12 cron jobs active, cleanup jobs successful, database 115.3 MB (23.05% of Free quota).
- [Ponytail Audit and applied cleanup](evidence/ponytail-audit.md); [original council review and peer reviews](evidence/council-review.md).

[ArchRide is deployed](https://nandanpraveen.github.io/archride/). All 34 production-path checks also passed against the live HTTPS site. [Deployment evidence](evidence/deployment.json) records the code and site commits, preserved portfolio/resume hashes, live checks and release tag. [An isolated rollback drill](evidence/frontend-rollback.json) restored all 102 prior artifact files without changing production.

[Lighthouse lab measurements](evidence/performance.json) scored mobile performance 99 and desktop performance 98, with accessibility, best practices and SEO at 100 in both runs. These are lab snapshots, not physical-device or real-user guarantees.

Project review still covers the same 14 items. Twelve are Done under the current guest-only scope. The ship-gate item remains In Progress for its explicit physical-device/student acceptance criteria; adaptive prediction remains In Progress until its real-data promotion criteria are met. No accuracy or hardware acceptance result is inferred from fixtures or desktop emulation.

Evidence already available:

- [Hosted security smoke](evidence/production-backend-smoke.json): 19 checks before the account-scope change, including private-row isolation, forged roles, current role/session revocation and account deletion. This is historical backend evidence, not proof of a student account flow in the released app.
- [Parking source and inventory audit](parking/README.md).
- [Geographic boundary verification](parking/boundary-verification.json): target 4,828.032 m, maximum sampled numeric deviation about 0.061 m. This is geometric verification, not a land-survey accuracy claim.

## External limits and remaining acceptance

No physical iPhone or Android hardware has been operated in this session. Chromium/WebKit automated testing and screenshots must not be described as physical-device acceptance. A real student usability test without coaching also remains distinct from agent-operated flows.

Parking event restrictions default to unverified; conflicting or missing official hours remain unknown. Check current signs and TPS notices. Transit availability depends on current authorized upstream data. Model code and fixture replay do not establish prediction accuracy; unsupported calculated windows remain disabled.

The Free Supabase plan has no leaked-password-protection upgrade enabled. Student accounts are absent; protected operator credentials still require ordinary maintenance. No paid plan change was made.

## Operations and rollback

Repository owner nandanpraveen controls deployment and maintainer authorization. Use the documented health/read admission endpoints and restricted operator tools to diagnose ingestion, routing and rate-limit failures. Do not expose personal records or worker secrets in logs.

Frontend rollback is a revert of the deployment commit in nandanpraveen.github.io; preserve the portfolio and resume. Database changes are additive, and existing private data is retained. Restoring public catalog exports is not equivalent to a complete Auth/private-data/Vault disaster-recovery drill.
