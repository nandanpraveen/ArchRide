# ArchRide delivery plan

[Open the GitHub project](https://github.com/users/nandanpraveen/projects/1). The current board contains **14 items**, including the added parking task and adaptive-prediction issue. Historical week assignments remain below. See [release verification](RELEASE.md) for the current scope, implementation evidence, and remaining external validation. Student sign-in was removed by the project owner on November 3; device storage and backend request limits replace its student-facing requirements.

All handoffs use America/New_York. Sunday is the shared review/handoff day between adjacent work windows.

| Week | Work window | Four drafts |
| --- | --- | --- |
| 1 | Oct 11–18, 2026 | 1. Material shell, campus search, Home; 2. authorized transit access and central ingestion; 3. private database/Auth/Profile/preferences; 4. map, route directory, route/stop details |
| 2 | Oct 18–25, 2026 | 5. walking and direct-bus planner; 6. arrivals/deadlines/reliability evaluation; 7. favorites/saved journeys; 8. weekly classes/next-class planning |
| 3 | Oct 25–Nov 1, 2026 | 9. active trips/alerts/recovery; 10. reminders/notification center; 11. admin/maintenance; 12. deployment/full-app release acceptance |

## How to claim work

Accept the repository invitation. Open the project, assign yourself to a draft, and set its status to In Progress. Read its Background dependencies before choosing an implementation. Coordinate shared types early; each task owns its feature tests and integration. Convert a draft to a repository issue when needed for a pull request, keeping it on this project. Do not create a duplicate issue for the same work.

Draft identifiers 1–12 below mean plan order, not GitHub issue numbers.

## Dependency handoffs

- Task 2 resolves authorized data access by October 12 and publishes real field contracts/fixtures for tasks 1, 4, 5, and 6. A blocked source is a team decision that must surface immediately.
- Task 3 coordinates personal table shapes and ownership/security with tasks 7–10. Tasks 1–4 can begin together using agreed contracts, but must integrate real data before closing.
- Tasks 5 and 6 agree full-journey timing, freshness, and deadline semantics. Task 7 recalculates saved journeys through that planner; task 8 uses it for classes.
- Tasks 9 and 10 use the same planning/arrival contracts. Task 11 exposes actual health/evaluation/maintenance from tasks 2, 6, and 10.
- Task 12 integrates and verifies all earlier work. QA starts throughout development, with final release acceptance in week three.

## Coverage of the agreed brief

| Brief feature | Responsible drafts |
| --- | --- |
| Five-destination Material navigation and Home dashboard | 1; personalized integration in 7, 8, 9, 10 |
| Live map, route filters, vehicle/stop panels, location fallback | 4 |
| Route directory, ordered stops, direction/variant, next three arrivals, boarding directions | 4, 5, 6 |
| Honest arrivals, timestamps/provenance, reliability evaluation and evidence-gated improvements | 2, 6, 11 |
| Building/entrance search and building-to-building direct-bus journey | 1, 2, 5 |
| Walking comparison, reachable boarding, leave-now and arrive-by assessment | 5, 6 |
| Service alerts, active trips and missed-bus recovery | 2, 9, 11 |
| Guest favorites, synced favorites and named/reordered saved journeys | 3, 7 |
| Private recurring classes and next-class Home/departure actions | 3, 8 |
| Leave-now/class reminders, quiet hours, deduplication, notification history, conditional supported push | 3, 8, 9, 10 |
| Auth, profile, default origin, walking pace, buffers, theme, sign-out, deletion, privacy | 3 |
| Complete shared/private data model, trusted ingestion, retention, indexes and RLS | 2, 3, 11 |
| Restricted admin, manual corrections/notices, failed jobs and prediction evaluation | 11 |
| Production hosting, provider access/quotas, security, accessibility, real devices, runbooks and release | 12 with every feature owner |

## Definition of done

Every draft uses the requested Summary, Background, Requirements, Out of scope, What we'll test, and Resources format. Read the full descriptions in the project or [the local backlog](backlog/01.md); `roadmap.json` is a machine-readable copy.

The ship gate requires every earlier feature integrated, no production starter placeholders, real authorized transit data, valid walking directions, privacy/RLS checks, all required test commands passing on the final commit, a production URL, and a completed production smoke test/rollback check. Fixture-only demos and unsupported accuracy claims do not pass. Background push and custom prediction improvements follow the evidence/support conditions in the original brief; in-app reminders and honest source estimates are required.

## Added scope

- Campus parking inventory, source reconciliation, access rules, list alternative, and geographic three-mile camera bounds.
- [Adaptive bus prediction using validated rider observations](https://github.com/nandanpraveen/ArchRide/issues/10), with independent evidence and promotion gates. Official predictions remain active until held-out evaluation supports a replacement.
