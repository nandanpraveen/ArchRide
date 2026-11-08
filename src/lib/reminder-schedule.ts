import type { ReminderJob } from "./class-reminders";
import { isNotificationEntry, type NewNotification } from "./notifications";
import { planRefHref, type ActiveTrip, type TravelPreferences } from "./personal";

export type ScheduledReminder = { dueAt: number; notification: NewNotification };

export function scheduledClassReminder(job: ReminderJob, prefs: TravelPreferences, walkingSeconds: number | null): ScheduledReminder {
  const walk = walkingSeconds !== null && Number.isFinite(walkingSeconds) && walkingSeconds >= 0 ? walkingSeconds : null;
  return {
    dueAt: Date.parse(job.arriveBy) - (walk === null ? 0 : walk * 1000 + prefs.buffer * 60000),
    notification: {
      type: "class",
      title: walk === null ? "Your class is coming up" : "Time to leave for class",
      body: `${job.title} at ${job.buildingName}`.slice(0, 200),
      link: planRefHref(prefs.defaultOrigin, { id: job.buildingId, name: job.buildingName, type: "building" }) + `&deadline=${encodeURIComponent(job.arriveBy)}`,
      dedupeKey: `class:${job.jobKey}`.slice(0, 200),
      expiresAt: job.startTime,
    },
  };
}

export function scheduledWalkReminder(trip: ActiveTrip | null, buffer: number): ScheduledReminder | null {
  if (!trip || trip.mode !== "walk" || trip.step !== 0 || !trip.deadline || trip.walkToSeconds == null) return null;
  return {
    dueAt: Date.parse(trip.deadline) - trip.walkToSeconds * 1000 - buffer * 60000,
    notification: {
      type: "leave_now",
      title: "Time to walk to your destination",
      body: `Walk to ${trip.destination.name}. Allow ${Math.ceil(trip.walkToSeconds / 60)} minutes plus your ${buffer}-minute buffer.`.slice(0, 200),
      link: planRefHref(trip.origin, trip.destination) + `&deadline=${encodeURIComponent(trip.deadline)}`,
      dedupeKey: `walk:${trip.destination.id}:${trip.deadline}`.slice(0, 200),
      expiresAt: trip.deadline,
    },
  };
}

export function dueReminder(job: ScheduledReminder, now = Date.now()) {
  // A late wake-up must not tell someone to leave for a journey they can no longer make.
  return now >= job.dueAt && now - job.dueAt <= 90000 && Date.parse(job.notification.expiresAt) > now;
}

export function validScheduledReminder(value: unknown, now = Date.now()): value is ScheduledReminder {
  if (!value || typeof value !== "object") return false;
  const job = value as ScheduledReminder;
  return Number.isFinite(job.dueAt) && job.dueAt >= now - 90000 && job.dueAt <= now + 8 * 86400000 &&
    isNotificationEntry({ ...job.notification, id: "scheduled", createdAt: new Date(now - 90001).toISOString(), readAt: null }) &&
    Date.parse(job.notification.expiresAt) > job.dueAt && Date.parse(job.notification.expiresAt) <= now + 8 * 86400000;
}
