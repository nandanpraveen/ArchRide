import type { ReminderJob } from "./class-reminders";
import type { NewNotification } from "./notifications";
import type { TravelPreferences } from "./personal";
import { planRefHref, quietNow } from "./personal";
export function classNotification(
  job: ReminderJob,
  prefs: TravelPreferences,
  walkingSeconds: number | null,
  now: number,
): NewNotification | null {
  if (quietNow(prefs, now) || Date.parse(job.startTime) <= now) return null;
  const walk =
    walkingSeconds !== null &&
    Number.isFinite(walkingSeconds) &&
    walkingSeconds >= 0
      ? walkingSeconds
      : null;
  const due =
    Date.parse(job.arriveBy) -
    (walk === null ? 0 : walk * 1000 + prefs.buffer * 60000);
  // A resumed tab does not deliver an expired leave-now instruction.
  if (now < due || now - due > 90000) return null;
  const destination = {
    id: job.buildingId,
    name: job.buildingName,
    type: "building" as const,
  };
  const deadline = encodeURIComponent(job.arriveBy);
  return {
    type: "class",
    title:
      walk === null ? "Your class is coming up" : "Time to leave for class",
    body: `${job.title} at ${job.buildingName}`.slice(0, 200),
    link:
      planRefHref(prefs.defaultOrigin, destination) + `&deadline=${deadline}`,
    dedupeKey: `class:${job.jobKey}`.slice(0, 200),
    expiresAt: job.startTime,
  };
}
