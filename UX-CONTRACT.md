# Shared arrival and deadline behavior

Authority: [week 2 task 6](docs/backlog/06.md). Visual controls follow [DESIGN.md](DESIGN.md); runtime theme tokens remain canonical. No visual tokens change in this work.

| Capability | Canonical owner | Variants and verification |
| --- | --- | --- |
| Arrival state and labels | `src/lib/transit/estimates.ts`, `ArrivalStatus` | Valid, stale, missing, cancelled, passed; controlled-clock unit and browser tests |
| Deadline interpretation | `src/lib/transit/deadlines.ts` | Full destination arrival, buffer, estimate label; no boarding-only assessment |
| Campus date input | `DeadlineSearch`, `campusDeadline` | Native datetime input deliberately accepts platform geometry; interpreted in America/New_York, never the device timezone. DST gaps rejected; ambiguous hour requires an explicit first (EDT) or second (EST) occurrence. |
| Form feedback | Material TextField, Alert, Button | App-owned validation with noValidate, persistent values, inline correction, first-field focus |
| Future service | `service-times.ts` | Calendar bounds, exceptions, repeated stop occurrence, GTFS >24h times. Unknown frequency templates unsupported. |

Home and Map use one source interpretation. Countdown requires a current prediction and a connected feed, reevaluated each second. Expired, absent, cancelled, passed or disconnected predictions have **null** countdown. Zero is never a fallback. Fetching the same source revision does not refresh validity. Partial feed ingestion does not establish route cancellation.

The 180-second threshold is a conservative operational limit: three current one-minute worker opportunities, verified in hosted job history on October 25. It is not a confirmed Passio quota or statistical confidence interval. Source validity is also required. Keep current polling unchanged until the team confirms provider limits.

Task 5 owns journey generation and verified walking paths. Supply complete `JourneyCandidate[]` to `DeadlineSearch` and `arriveBy`; `scheduledJourney` adapts a chosen direct stop pattern and verified walking legs, not a second planner. `departureAt` is the time the student leaves the origin, including preboarding walk/buffer; `destinationArrivalAt` includes the final walk. A schedule candidate's service date must be checked with `operatesOn`. Do not mark arbitrary client input verified. The current Plan page has no task-5 candidate producer, so it honestly reports insufficient data.

Tasks 9/10 must store stable trip instance and stop occurrence IDs, then recompute `arrivalEstimate` and `assessDeadline` at every render/reminder dispatch. Never persist a countdown or an on-time classification as an enduring fact. Suppress live countdown reminders after validity expires, feed disconnects, a cancellation arrives or the trip instance changes. A prediction that moves backwards in source time must be discarded with `newerArrival`.

All classifications are estimates: full arrival after deadline = likely late; arrival at/before deadline but slack below user buffer = tight; slack at/above buffer = on time. Invalid/past deadline, incomplete legs, unsupported service or expired live horizon = insufficient data. No probability, confidence tier, calibrated window or custom adjustment is enabled.
