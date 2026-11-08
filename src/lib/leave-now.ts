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
  walkSeconds?: number;
  safetySeconds?: number;
  planLink?: string;
  activeTrip?: boolean;
  instanceKey?: string;
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
  const walking = watch.walkSeconds;
  const safety = watch.safetySeconds ?? 0;
  const hasWalk =
    Number.isFinite(walking) &&
    walking! >= 0 &&
    walking! <= 7200 &&
    Number.isFinite(safety) &&
    safety >= 0 &&
    safety <= 1800;
  const remaining = estimate?.arrivalAt
    ? (Date.parse(estimate.arrivalAt) - now) / 1000
    : NaN;
  if (hasWalk && estimate?.state === "valid" && remaining < walking! + safety) {
    if (
      !preferences.tripUpdatesEnabled ||
      handledKeys.has(`unreachable:${watch.arrivalId}`)
    )
      return null;
    return {
      type: "trip",
      title: "Recheck your trip",
      body: "This bus may arrive before you can reach its stop. Compare another bus or walking.",
      link: watch.planLink?.startsWith("/plan?")
        ? watch.planLink
        : `/map?stop=${encodeURIComponent(watch.stopId)}`,
      dedupeKey: `unreachable:${watch.arrivalId}`,
      expiresAt: new Date(
        Math.max(now + 1000, Date.parse(estimate.arrivalAt!)),
      ).toISOString(),
    };
  }
  const message =
    hasWalk && estimate?.state === "valid"
      ? remaining <= walking! + safety + 60
        ? "Time to leave for your bus"
        : null
      : determineNotifSignaling(estimate, preferences.busLeadMinutes);
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
    expiresAtMs =
      Date.parse(estimate.arrivalAt) + LATE_BUS_GRACE_MINUTES * minuteInMs;
  }

  return {
    type: "leave_now",
    title: message,
    body: (hasWalk && !cancelled
      ? `Walk to ${watch.stopName} for ${watch.routeName}. Allow ${Math.ceil(walking! / 60)} minutes plus your buffer.`
      : `${watch.routeName} at ${watch.stopName}`).slice(0, 200),
    // Opens the stop's details. The id is encoded because stop ids contain a colon.
    link: watch.planLink?.startsWith("/plan?")
      ? watch.planLink
      : `/map?stop=${encodeURIComponent(watch.stopId)}`,
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
          " away."
        );

      case "cancelled":
        return "Bus watch cancelled.";
    }
  }
  return null;
}
