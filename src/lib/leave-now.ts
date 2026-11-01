import type { ArrivalEstimate } from "./transit/estimates";
import type {
  NewNotification,
  NotificationPreferences,
} from "@/lib/notifications";

/** A bus the student tapped "Watch this bus" on. */
export type WatchedBus = {
  arrivalId: string; // stable trip instance + stop occurrence, including service date
  tripId: string; // which bus run
  stopId: string; // which stop they're waiting at
  routeName: string; // for example "Route L"
  stopName: string; // for example "Tate Center"
};

const minuteInMs = 60_000;
// Buses run late, so a leave-now prompt stays up this long past the predicted arrival.
const LATE_BUS_GRACE_MINUTES = 10;
// A cancelled bus may have no arrival time, so its notice lasts this long from now.
const CANCELLED_NOTICE_MINUTES = 30;

/** The notification to create for a watched bus right now, or null when there is nothing to do. */
export function leaveNowReminder(
  watch: WatchedBus,
  estimate: ArrivalEstimate | null,
  preferences: NotificationPreferences,
  handledKeys: ReadonlySet<string>,
  now = Date.now(),
): NewNotification | null {
  if (!preferences.leaveNowEnabled) return null;
  const message = determineNotifSignaling(estimate, preferences.busLeadMinutes);
  if (message === null || estimate === null) return null;
  // A cancellation gets its own key, so it can still arrive after a leave-now prompt.
  const cancelled = estimate.state === "cancelled";
  const label = cancelled ? "cancel" : "leave";
  const key = `${label}:${watch.arrivalId}`;
  if (key.length > 200) return null;
  if (handledKeys.has(key)) return null;

  let expiresAtMs = now + CANCELLED_NOTICE_MINUTES * minuteInMs;
  if (!cancelled) {
    if (estimate.arrivalAt === null) return null;
    expiresAtMs = Date.parse(estimate.arrivalAt) + LATE_BUS_GRACE_MINUTES * minuteInMs;
  }

  return {
    type: "leave_now",
    title: message,
    body: `${watch.routeName} at ${watch.stopName}`,
    // Opens the stop's details. The id is encoded because stop ids contain a colon.
    link: `/map?stop=${encodeURIComponent(watch.stopId)}`,
    dedupeKey: key,
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
}

export function determineNotifSignaling(
  estimate: ArrivalEstimate | null,
  leadTime: number,
): string | null {
  if (estimate) {
    switch (estimate.state) {
      case "valid":
        const minutesAway = estimate.countdownMinutes;
        if (minutesAway === null) return null;
        if (minutesAway > leadTime) return null;
        return (
          "Your bus is " +
          minutesAway +
          (minutesAway === 1 ? " minute" : " minutes") +
          " away. Leave now if you want to catch it!"
        );

      case "cancelled":
        return "Bus watch cancelled.";
    }
  }
  return null;
}
