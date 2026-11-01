# Week 3: leave-now reminders and notification center

Status: built, in-app only. Written 2026-10-31.

## What students get

- **Watch a bus.** A student marks one bus at one stop ("Route L at Tate Center") as watched. Up to 5 at a time, each forgotten after 3 hours.
- **Leave-now reminder.** While ArchRide is open, a banner and a notification appear when the watched bus's live countdown is at or under the student's lead time. The lead time is a fixed number from 1 to 15 minutes, default 5. Walking time to the stop is not estimated.
- **Cancellation notice.** If the feed explicitly reports the bus as cancelled or skipped, the student is told once and the watch ends.
- **Notification center** at `/notifications`, opened from the bell in the top bar: read, mark read, mark all read, clear.
- **Settings** on Profile: the leave-now switch and the lead time.

Reminders are shown **inside the app only, and only while it is open in a browser**. They are not texts, emails, or phone notifications, and the settings screen says so.

## How it works

```
Watch this bus  ->  watched list (this device)
                          |
          every 60 s, and when the tab becomes visible again
                          |
   read the arrival feed's health + the watched trip's rows at its stop
                          |
   pickWatchedEstimate  ->  ArrivalEstimate (valid / cancelled / passed / stale / missing)
                          |
   leaveNowReminder(watch, estimate, settings, handled keys)  ->  notification or nothing
                          |
   useNotifications.add  ->  Supabase (signed in) or this device (guest)
                          |
   remember the key as handled; show the banner; drop the watch if the bus passed or was cancelled
```

Rules that matter:

- **No trusted countdown without a healthy feed.** If the feed's health cannot be read or is not current, every prediction counts as stale and nothing is sent.
- **A missing row is not a cancellation.** Only an explicit `CANCELED` or `SKIPPED` row produces the cancellation notice. This follows `src/lib/transit/estimates.ts`.
- **One reminder per bus per stop.** The dedupe key is `leave:<trip>:<stop>` (cancellation: `cancel:<trip>:<stop>`). The database enforces it with `unique (user_id, dedupe_key)`.
- **Clearing does not bring it back.** Clearing deletes the row, which frees the database key, so the app also remembers handled keys on the device until each reminder's expiry.
- **Expiry.** A leave-now notification disappears 10 minutes after the predicted arrival (buses run late). A cancellation notice lasts 30 minutes.

## Where the code is

| Piece | File |
|---|---|
| Table definitions, row security | `supabase/migrations/20261031120000_notifications.sql` (hand-applied, see below) |
| Database tests (pgTAP) | `supabase/tests/database/notifications.test.sql` |
| Types, converters, settings checks, guest storage | `src/lib/notifications.ts` |
| Load / add / mark read / clear / save settings | `src/lib/use-notifications.ts` |
| "Should this bus notify now?" | `src/lib/leave-now.ts` |
| Watch list, handled keys, picking the estimate | `src/lib/watched-buses.ts` |
| Timer, shared state, banner | `src/components/notifications-provider.tsx` |
| Bell, page, settings, watch button | `src/components/notification-bell.tsx`, `src/app/notifications/page.tsx`, `src/components/notification-settings.tsx`, `src/components/watch-bus-button.tsx` |

Shared files that were touched: `src/components/app-shell.tsx` (provider and bell), `src/app/profile/profileUI.tsx` (settings block), `src/lib/use-classes.ts` (`findAccount` is now exported), `package.json` and `.github/workflows/ci.yml` (a `test:notifications` script and CI step).

## Storage

| What | Signed in | Guest |
|---|---|---|
| Notifications | `notifications` table | `localStorage` `archride.notifications.v1` |
| Settings | `notification_preferences` table | `localStorage` `archride.notification-preferences.v1` |
| Watched buses | `localStorage` `archride.watched-buses.v1` (device only, for everyone) | same |
| Handled reminder keys | `localStorage` `archride.handled-reminders.v1` (device only, for everyone) | same |

Row security: a student can read, create, and delete only their own notifications, and can change only `read_at` on them. They cannot create a notification for someone else, rewrite its text, or point its link outside the app. Signed-out visitors have no access to either table.

## Web push: what it would take (not built)

In-app delivery cannot reach a student whose phone is locked or whose browser tab is frozen. Web push can, but it is a separate project. Support as of 2026-10-31, from the sources below:

| Platform | Web push | Notes |
|---|---|---|
| Chrome, Edge, Firefox (desktop and Android) | Yes | MDN lists the Push API as Baseline, available across browsers since March 2023. Needs an active service worker and the user's opt-in. Android specifics were not individually checked. |
| Safari on macOS 13 (Ventura) or later | Yes | Safari 16+. The permission request needs an explicit user gesture. No Apple Developer account needed. |
| Safari on iPhone / iPad, in a normal browser tab | No | Apple's developer forums state Web Push does not work in Safari tabs on iOS. |
| iPhone / iPad, site saved to the Home Screen | Yes, iOS/iPadOS 16.4+ | Standalone display mode is required, and the permission request can only come from a tap. |
| iOS/iPadOS 18.4+ Home Screen web apps | Adds Declarative Web Push | Notifications can show without a service worker. |

The iPhone gap matters most: **most students would have to install ArchRide to the Home Screen before they could receive any push**, and a normal Safari tab never can.

ArchRide today has no web app manifest and no service worker (`public/` holds only the map worker), so web push would need all of:

1. A service worker and a web app manifest.
2. VAPID keys, and a table that stores each student's push subscription.
3. A server job (for example a Supabase Edge Function on a schedule) that checks watched buses and sends the push, because the browser may be closed.
4. Moving the watched list from the device to the account, so the server knows what to watch.
5. A permission prompt shown after a clear user action (never on page load), plus a way to turn it off.

Sources: [MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API), [WebKit: Meet Web Push](https://webkit.org/blog/12945/meet-web-push/), [WebKit: Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [Apple Developer Forums: PWA push notifications on iOS](https://developer.apple.com/forums/thread/732594), [WWDC23: What's new in web apps](https://developer.apple.com/videos/play/wwdc2023/10120/), [WebKit: Safari 18.4 features](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/). These pages date from 2023 to 2025; re-check them before building on this.

## Deliberately cut

- **Quiet hours.** Reminders only appear while the app is open, so there is nothing to silence.
- **Server jobs and web push.** See above.
- **Trip-change events from task 9.** Only leave-now reminders are created, so the settings screen shows only that one switch. The `class_reminders_enabled`, `alerts_enabled` and `trip_updates_enabled` columns stay in the table, unused, so adding those kinds later needs no migration.
- **SMS and email.** Out of scope for the web app; to be reconsidered with the mobile app.
- **Walking-time estimates.** The lead time is a fixed number the student chooses. The planner's numbers are placeholders and must not feed leave times.
- **Deleting an account's notification data beyond the cascade.** Deleting the auth user deletes both tables' rows (`on delete cascade`). There is no separate export or purge.

## Known gaps and setup notes

- **The migration was applied by hand** in the Supabase SQL editor, like `classes`, so it is not in the project's migration history. The Supabase CLI is not installed or linked. Anyone who later runs `supabase db push` must first run `supabase migration repair` for the hand-applied migrations, or it will try to apply them again.
- **The pgTAP file has never been run.** `supabase test db` needs Docker, and CI does not run it. The browser tests below exercise only the guest path.
- **The signed-in path has no automated test.** Loading, saving settings (an upsert), inserting, marking read and clearing against the real tables were checked only for types and logic. Confirm them once by hand: sign in, change the lead time, and look at `notification_preferences` and `notifications` in the dashboard.
- **Background tabs.** Browsers slow down or freeze timers in tabs that are not visible, especially on phones, so a reminder can arrive late until the student returns to the app. The check also runs as soon as the tab becomes visible.
- **Home needs the button.** `WatchBusButton` exists but has to be placed in a departure row (`src/components/home-departures.tsx`) before students can start watching a bus.

## Tests

- `pnpm test:notifications`: unit tests for the decision logic, converters, guest storage and the watched list. Runs in CI.
- `pnpm exec playwright test tests/e2e/notifications.spec.ts`: guest browser tests for the empty center, settings, a close bus, lead time, a far bus, reminders off, an unhealthy feed, a cancelled bus, and a bus with no row. The Playwright config starts its own server on port 3100, so stop `pnpm dev` first.
