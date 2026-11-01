import { DateTime } from "ts-luxon";

export const CAMPUS_ZONE = "America/New_York";

export type ClassEntry = {
  id: string;
  title: string;
  weekdays: number[]; // Luxon numbering: Monday = 1 ... Sunday = 7
  startsAt: string; // 24-hour "HH:mm", campus wall-clock time
  enabled: boolean;
  buildingId: string; // id of a verified transit_buildings row
  buildingName: string; // saved label so the class stays readable if the building is retired
  minutesEarly: number; // minutes to arrive early, 0-60
  reminderEnabled: boolean; // task 10 reads this; nothing is delivered from here
};

// An enabled class's next start as an ISO string in America/New_York. Reminder jobs for task 10
// come from reminderJobs in src/lib/class-reminders.ts.
export type NextOccurrence = {
  classEntry: ClassEntry;
  startTime: string; // ISO, in America/New_York
};

import { campusDeadline } from "../../lib/transit/deadlines";

export default function getNextOccurrence(
  classes: ClassEntry[],
  clock: number | DateTime = Date.now(),
): NextOccurrence | null {
  const now = typeof clock === "number" ? clock : clock.toMillis();
  if (!Number.isFinite(now)) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  const today = Date.parse(
    `${parts.year}-${parts.month}-${parts.day}T00:00:00Z`,
  );
  let next: NextOccurrence | null = null;
  for (let offset = 0; offset <= 7; offset++) {
    // Advance calendar dates rather than elapsed local hours across DST changes.
    const day = new Date(today + offset * 86_400_000);
    const weekday = ((day.getUTCDay() + 6) % 7) + 1;
    for (const entry of classes) {
      if (
        !entry.enabled ||
        !entry.title.trim() ||
        !entry.weekdays.includes(weekday) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.startsAt)
      )
        continue;
      const local = `${day.toISOString().slice(0, 10)}T${entry.startsAt}`;
      // Skip nonexistent spring times; consider both occurrences of a fall fold.
      for (const choice of ["earlier", "later"] as const) {
        const startTime = campusDeadline(local, choice);
        if (
          startTime &&
          Date.parse(startTime) > now &&
          (!next || startTime < next.startTime)
        )
          next = { classEntry: entry, startTime };
      }
    }
  }
  if (next && typeof clock !== "number") {
    next.startTime = DateTime.fromISO(next.startTime, {
      zone: CAMPUS_ZONE,
    }).toISO()!;
  }
  return next;
}
