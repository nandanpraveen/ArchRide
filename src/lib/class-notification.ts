import type { ReminderJob } from "./class-reminders";
import type { NewNotification } from "./notifications";
import type { TravelPreferences } from "./personal";
import { quietNow } from "./personal";
import { dueReminder, scheduledClassReminder } from "./reminder-schedule";
export function classNotification(
  job: ReminderJob,
  prefs: TravelPreferences,
  walkingSeconds: number | null,
  now: number,
): NewNotification | null {
  if (quietNow(prefs, now) || Date.parse(job.startTime) <= now) return null;
  const jobToSend = scheduledClassReminder(job, prefs, walkingSeconds);
  return dueReminder(jobToSend, now) ? jobToSend.notification : null;
}
