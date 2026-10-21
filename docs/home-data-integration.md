# Home data integration — October 21, 2026

This follow-up connects the public data work deferred in [Alethea's PR #1 handoff comment](https://github.com/nandanpraveen/ArchRide/pull/1#issuecomment-6279131922). Her October 19 comment identified the placeholder search adapter, nearby stops/departures, manual origin and other feature dependencies. The implemented Home now consumes the shared Supabase catalog and source predictions; this record does not declare every later project feature complete.

## Real public catalog

The hosted ArchRide catalog was verified with **354 buildings, 86 mapped automatic-door points and 161 transit stops**. Buildings and doors come from the official UGA Office of University Architects GIS sources, restricted to the reviewed named campus-property polygons. Stops remain the UGA/Passio GTFS boarding points. See the [campus source/import runbook](campus/README.md), [reviewed import report](campus/evidence/import-report.json) and [source evidence](campus/evidence/source-evidence.json).

Search covers buildings, entrances and stops with stable source IDs and explicit types. It supports literal source names, reviewed aliases, capitalization/space normalization, duplicate names, keyboard selection and long labels. Source coordinates distinguish same-name stops; selecting a destination retains its identity and offers its Map details. Partially failed searches retain successful catalog sources and disclose incomplete results.

The app attributes campus places to the [UGA Office of University Architects](https://www.architects.uga.edu/maps), separately from UGA/Passio transit attribution. Building coordinates are reference points. The door layer identifies automatic doors, not a complete entrance inventory, current door operation or a verified accessible walking route. Imported door accessibility remains unknown. The selected campus polygons are the catalog's inclusion scope, not the final Week 3 parking/map camera boundary.

## Origin, destination and nearby departures

- A separate keyboard-accessible manual-origin picker lets a guest choose a verified building, entrance or stop. GPS remains optional and is requested only after the location button is activated. Denied, unavailable, timed-out and far-from-stop results retain manual selection.
- Origin, destination and GPS coordinates live only in Home component memory. No GPS coordinates are written to browser storage, URLs or the transit provider. A delayed GPS callback cannot replace a later manual choice.
- Home selects up to three nearby boarding stops from verified coordinates. Distances are labeled approximate straight-line distances; they do not establish a walkable route, walking time or ability to catch a bus. Far-away coordinates produce a manual-selection prompt without claiming an official campus boundary.
- `readHomeDepartures` reads the shared public Supabase snapshot for the selected stops. It displays up to three current source predictions per stop, with route, supplied direction/headsign, stop-occurrence identity, source update time and validity time. Unsupported, cancelled, stale, expired or implausibly future-dated predictions are excluded. A local clock removes expired rows without requiring navigation or a successful network refresh.
- Per-stop failures preserve unaffected departures and expose retry. Changing origins aborts superseded reads and rejects late results. The public API has bounded timeouts; successful empty predictions are distinguished from stale or unavailable feed health. Missing predictions never establish route cancellation or absence of buses.
- Plan links preserve manual origin/destination IDs and their types. A GPS origin passes only a `current-location` label; coordinates stay on Home. Plan explains that GPS must be shared again when supported planning is available. Selected places can be reviewed without inventing a journey recommendation.

## Freshness and partial failures

Home reads the centrally ingested Supabase data; browsers do not poll Passio or UGA GIS. The public snapshot keeps successful datasets when another endpoint fails, retains the last loaded failed part, and labels its error. Public refresh pauses while the page is hidden. Search, snapshot and departure requests have cancellation/timeout protection.

Static transit, campus-place sync and realtime freshness are displayed separately, using source timestamps rather than the latest browser fetch time. Feed-health failure produces an unknown status instead of a current claim. Alerts respect their source active periods, retain original timestamps and disclose failed refreshes. Offline and retry states remain available to guests.

## Validation and evidence

The integration passed `pnpm lint`, `pnpm typecheck`, the generated Edge bundle check, **38 domain/database tests**, **58 desktop/mobile browser checks**, and `pnpm build`. Coverage includes catalog filtering/security, public-read contracts, prediction validity and identity, source outages, manual/GPS origins, superseded responses, aliases/duplicate results, keyboard navigation, selected Plan context and 320 px layouts. Browser fixtures are synthetic and separate from production data.

The [hosted-data smoke record](campus/evidence/home-hosted-smoke.json), checked October 21 at 04:30 UTC, runs a **local production Next.js build against real hosted public Supabase data**. It verifies the real catalog counts, Miller Learning Center manual origin, Physics Building destination, selected Plan context, Map place details/attribution, 320 px layout and no page exceptions. At that check, the source supplied no usable current departures; the real unavailable state passed.

The subsequent [live-departure smoke](campus/evidence/home-live-smoke.json) at 04:37 UTC found 62 usable predictions and verified actual source departures on Home and Map for Myers/Snelling Southbound, with no page exceptions. The [afternoon read-only UI follow-up](campus/evidence/home-current-smoke.json) at 18:34 UTC found the overall arrival feed stale while 246 individual prediction rows still passed the per-row source-clock/expiry checks. Home displayed the stale feed warning alongside valid rows for Learning & Development; Map details also displayed source-valid rows. That result does not establish a healthy current arrival feed. Both runs read hosted Supabase only; neither contacted the provider or invoked ingestion. Deterministic tests separately verify prediction expiry and invalid-row rejection.

The same record contains a limited contrast sample: heading/body samples at 18.1:1 and the location button at 7.21:1. A sampled reduced-motion transition computed to `0.00001s`. These samples are not a complete contrast audit, screen-reader audit or real-device certification. The production-build smoke is not a public production deployment.

## Current polling update and remaining dependencies

On October 21, the user requested temporary realtime operation at the existing one-minute dispatcher cadence while the provider's permitted interval/quota remains unconfirmed. [Activation evidence](campus/evidence/live-polling-status.json) records enabled configuration, the active minute cron, a 30-second configured minimum to tolerate scheduling jitter, and two successful automatic runs at 04:36 and 04:37 UTC. All three realtime feeds were healthy at that acceptance check. The tested worker source was deployed, and unauthenticated invocation remained denied with HTTP 401. This is user-directed temporary configuration, not provider approval or a prediction-accuracy claim.

The [18:33 UTC polling follow-up](campus/evidence/live-polling-followup.json) records unchanged configuration and partial arrival-feed rejection; the later UI smoke above preserves that stale overall-feed status. Existing HTTP 429 cooldown/backoff, overlap protection and retention remain in force. No code, polling configuration or provider contact was changed during the read-only afternoon review. See [hosted status](transit/HOSTED_STATUS.md).

The trip algorithm, verified walking routes, catchable-bus/arrival-deadline recommendations, saved-item storage/sync, classes, authentication/profile flows, reminders, active trips, notifications and final parking/map bounds remain with their project owners. Home provides honest pending states and existing navigation for these dependencies. Alethea's Week 2 Saved task is outside this public-data follow-up. No project draft should be marked Done solely from these tests or the PR merge.
