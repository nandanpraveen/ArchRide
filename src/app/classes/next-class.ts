import { campusDeadline } from "@/lib/transit/deadlines";
export const CAMPUS_ZONE = "America/New_York";
export type ClassEntry = {
  id: string;
  updatedAt?: string;
  title: string;
  weekdays: number[];
  startsAt: string;
  enabled: boolean;
  buildingId: string;
  buildingName: string;
  minutesEarly: number;
  reminderEnabled: boolean;
};
export type NextOccurrence = { classEntry: ClassEntry; startTime: string };
export function campusDate(now: number) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: CAMPUS_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}
export default function getNextOccurrence(
  classes: ClassEntry[],
  clock: number | { toMillis(): number } = Date.now(),
): NextOccurrence | null {
  const now = typeof clock === "number" ? clock : clock.toMillis();
  if (!Number.isFinite(now)) return null;
  const today = Date.parse(campusDate(now) + "T00:00:00Z");
  let next: NextOccurrence | null = null;
  for (let offset = 0; offset <= 7; offset++) {
    const day = new Date(today + offset * 86400_000);
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
      // Skip nonexistent times; a repeated hour uses its next available occurrence.
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
  return next;
}
