import { DateTime } from "ts-luxon";
import { CAMPUS_ZONE, type ClassEntry } from "@/app/classes/next-class";

// Reminder contract for task 10. Nothing is delivered from here: task 10 turns these jobs into
// notifications and stores the jobKey of each one it schedules. All times are campus time
// (America/New_York), whatever timezone the phone is in.
export type ReminderJob = {
  // Identifies one class on one campus date with the details below. Editing the time, building,
  // title or arrive-early minutes gives the job a new key, so the old stored key is obsolete.
  jobKey: string;
  classId: string;
  title: string;
  buildingId: string;
  buildingName: string;
  startTime: string; // ISO with the campus offset, e.g. 2026-10-29T09:30:00.000-04:00
  arriveBy: string; // startTime minus the class's arrive-early minutes, same format
};

export type ReminderSyncPlan = {
  cancel: string[]; // stored job keys that are obsolete
  schedule: ReminderJob[]; // wanted jobs that are not stored yet
};

// Short fingerprint (FNV-1a) of the class details a reminder shows or is timed by.
function fingerprint(classEntry: ClassEntry) {
  const text = JSON.stringify([
    classEntry.startsAt,
    classEntry.minutesEarly,
    classEntry.title,
    classEntry.buildingId,
    classEntry.buildingName,
  ]);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// Reminders for meetings that start after `now` and before `now` + `days` whole days, soonest
// first. Only enabled classes with the reminder turned on count. With the default 7 days, each
// weekly meeting appears exactly once.
export function reminderJobs(classes: ClassEntry[], now: DateTime, days = 7): ReminderJob[] {
  const campusNow = now.setZone(CAMPUS_ZONE);
  const until = campusNow.plus({ days });
  const found: { job: ReminderJob; start: number }[] = [];

  for (const classEntry of classes) {
    if (!classEntry.enabled || !classEntry.reminderEnabled) continue;
    const [hour, minute] = classEntry.startsAt.split(":").map(Number);
    const details = fingerprint(classEntry);

    for (let offset = 0; offset <= days; offset++) {
      const day = campusNow.startOf("day").plus({ days: offset });
      if (!classEntry.weekdays.includes(day.weekday)) continue;

      const start = day.set({ hour, minute });
      if (start <= campusNow || start >= until) continue;

      found.push({
        start: start.toMillis(),
        job: {
          jobKey: `${classEntry.id}:${day.toFormat("yyyy-MM-dd")}:${details}`,
          classId: classEntry.id,
          title: classEntry.title,
          buildingId: classEntry.buildingId,
          buildingName: classEntry.buildingName,
          startTime: start.toISO() ?? "",
          arriveBy: start.minus({ minutes: classEntry.minutesEarly }).toISO() ?? "",
        },
      });
    }
  }

  return found
    .sort((a, b) => a.start - b.start || a.job.jobKey.localeCompare(b.job.jobKey))
    .map(({ job }) => job);
}

// Compares the job keys task 10 has stored with the jobs wanted now. Run it after any change to
// the classes: an edited, disabled, reminder-off, deleted or already-started class leaves its old
// key out of `wanted`, so that key lands in `cancel`.
export function planReminderSync(storedKeys: string[], wanted: ReminderJob[]): ReminderSyncPlan {
  const stored = new Set(storedKeys);
  const wantedKeys = new Set(wanted.map((job) => job.jobKey));
  return {
    cancel: [...stored].filter((key) => !wantedKeys.has(key)),
    schedule: wanted.filter((job) => !stored.has(job.jobKey)),
  };
}
