import { campusDate, type ClassEntry } from "@/app/classes/next-class";
import { campusDeadline } from "./transit/deadlines";
export type ReminderJob = {
  jobKey: string;
  classId: string;
  title: string;
  buildingId: string;
  buildingName: string;
  startTime: string;
  arriveBy: string;
};
export function reminderJobs(
  classes: ClassEntry[],
  clock: number | { toMillis(): number },
  days = 7,
): ReminderJob[] {
  const now = typeof clock === "number" ? clock : clock.toMillis();
  if (!Number.isFinite(now) || days < 1 || days > 14) return [];
  const today = Date.parse(campusDate(now) + "T00:00:00Z");
  const endDay = new Date(today + days * 86400_000).toISOString().slice(0, 10);
  const until = campusDeadline(
    endDay +
      "T" +
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "America/New_York",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(now),
    "earlier",
  );
  const result: ReminderJob[] = [];
  for (let offset = 0; offset <= days; offset++) {
    const day = new Date(today + offset * 86400_000),
      date = day.toISOString().slice(0, 10);
    const weekday = ((day.getUTCDay() + 6) % 7) + 1;
    for (const c of classes) {
      if (!c.enabled || !c.reminderEnabled || !c.weekdays.includes(weekday))
        continue;
      const start = campusDeadline(date + "T" + c.startsAt, "earlier");
      if (
        !start ||
        Date.parse(start) <= now ||
        Date.parse(start) >= Date.parse(until ?? "")
      )
        continue;
      const details = JSON.stringify([
        c.title,
        c.buildingId,
        c.buildingName,
        c.startsAt,
        c.minutesEarly,
      ]);
      let hash = 2166136261;
      for (const ch of details)
        hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
      result.push({
        jobKey: `${c.id}:${date}:${(hash >>> 0).toString(16)}`,
        classId: c.id,
        title: c.title,
        buildingId: c.buildingId,
        buildingName: c.buildingName,
        startTime: start,
        arriveBy: new Date(
          Date.parse(start) - c.minutesEarly * 60000,
        ).toISOString(),
      });
    }
  }
  return result.sort(
    (a, b) =>
      Date.parse(a.startTime) - Date.parse(b.startTime) ||
      a.jobKey.localeCompare(b.jobKey),
  );
}
