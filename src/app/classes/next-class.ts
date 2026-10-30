import { DateTime } from "ts-luxon";

const CAMPUS_ZONE = "America/New_York";

export type ClassEntry = {
  id: number;
  title: string;
  weekdays: number[]; // Luxon numbering: Monday = 1 ... Sunday = 7
  startsAt: string; // 24-hour "HH:mm"
  enabled: boolean;
};

export type NextOccurrence = {
  classEntry: ClassEntry;
  startTime: string; // ISO, in America/New_York
};

const parseTimeString = (time: string): number[] => {
  return time.split(":").map((part) => parseInt(part, 10));
};

// Returns the single soonest class start after `now`, or null if there is none.
export default function getNextOccurrence(
  classes: ClassEntry[],
  now: DateTime,
): NextOccurrence | null {
  const campusNow = now.setZone(CAMPUS_ZONE);
  let best: { classEntry: ClassEntry; start: DateTime } | null = null;

  for (const classEntry of classes) {
    if (!classEntry.enabled) continue;

    const [hour, minute] = parseTimeString(classEntry.startsAt);

    for (const weekday of classEntry.weekdays) {
      // Days from today until this weekday (0 = today).
      const daysAhead = (weekday - campusNow.weekday + 7) % 7;

      let start = campusNow
        .startOf("day")
        .plus({ days: daysAhead })
        .set({ hour, minute });

      // Already started (or starting right now): use next week's meeting.
      if (start <= campusNow) {
        start = start.plus({ weeks: 1 });
      }

      if (best === null || start < best.start) {
        best = { classEntry, start };
      }
    }
  }

  if (best === null) return null;

  return {
    classEntry: best.classEntry,
    startTime: best.start.toISO() ?? "",
  };
}
