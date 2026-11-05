import assert from "node:assert/strict";
import test from "node:test";
import type { ClassEntry } from "../../src/app/classes/next-class";
import {
  reminderJobs,
  type ReminderJob,
} from "../../src/lib/class-reminders";

// Dates used: Tue Oct 27, Thu Oct 29, Sat Oct 31, Sun Nov 1, Mon Nov 2 2026.
// Daylight saving ends Sun Nov 1 2026 (New York goes from -04:00 to -05:00).

const at = (iso: string, zone = "America/New_York") =>
  Date.parse(
    iso +
      (zone === "Asia/Tokyo"
        ? "+09:00"
        : iso.slice(0, 10) >= "2026-11-01"
          ? "-05:00"
          : "-04:00"),
  );
const keys = (jobs: ReminderJob[]) => jobs.map((job) => job.jobKey);

const entry = (
  overrides: Partial<ClassEntry> & Pick<ClassEntry, "id" | "title">,
): ClassEntry => ({
  weekdays: [1, 4],
  startsAt: "09:30",
  enabled: true,
  buildingId: "test-building",
  buildingName: "Test Building",
  minutesEarly: 15,
  reminderEnabled: true,
  ...overrides,
});

const calculus = entry({ id: "calc", title: "Calculus", weekdays: [1, 4] });
const tuesday = at("2026-10-27T12:00");

test("creates a job for each meeting in the next 7 days, keeping campus wall-clock time across daylight saving", () => {
  const jobs = reminderJobs([calculus], tuesday);
  assert.deepEqual(
    jobs.map((job) => job.startTime),
    [
      new Date("2026-10-29T09:30:00.000-04:00").toISOString(),
      new Date("2026-11-02T09:30:00.000-05:00").toISOString(),
    ],
  );
  assert.deepEqual(
    jobs.map((job) => job.arriveBy),
    [
      new Date("2026-10-29T09:15:00.000-04:00").toISOString(),
      new Date("2026-11-02T09:15:00.000-05:00").toISOString(),
    ],
  );
  assert.equal(jobs[0].classId, "calc");
  assert.equal(jobs[0].title, "Calculus");
  assert.equal(jobs[0].buildingName, "Test Building");
});

test("keeps the same wall-clock time on the day daylight saving ends", () => {
  const sunday = entry({ id: "sun", title: "Seminar", weekdays: [7] });
  const [job] = reminderJobs([sunday], at("2026-10-31T12:00"));
  assert.equal(
    job.startTime,
    new Date("2026-11-01T09:30:00.000-05:00").toISOString(),
  );
  assert.equal(
    job.arriveBy,
    new Date("2026-11-01T09:15:00.000-05:00").toISOString(),
  );
});

test("uses campus time when the phone is in another timezone", () => {
  // 09:00 in Tokyo on Tue Oct 27 is still Mon Oct 26 evening on campus.
  const tokyo = reminderJobs([calculus], at("2026-10-27T09:00", "Asia/Tokyo"));
  const campus = reminderJobs([calculus], at("2026-10-26T20:00"));
  assert.deepEqual(tokyo, campus);
  assert.equal(
    tokyo[0].startTime,
    new Date("2026-10-29T09:30:00.000-04:00").toISOString(),
  );
});

test("skips disabled classes and classes with the reminder turned off", () => {
  const jobs = reminderJobs(
    [
      { ...calculus, id: "off", enabled: false },
      { ...calculus, id: "quiet", reminderEnabled: false },
      { ...calculus, id: "on" },
    ],
    tuesday,
  );
  assert.deepEqual([...new Set(jobs.map((job) => job.classId))], ["on"]);
});

test("leaves out a meeting that is starting now or already started, and never repeats a weekly meeting", () => {
  const jobs = reminderJobs([calculus], at("2026-10-29T09:30"));
  assert.deepEqual(
    jobs.map((job) => job.startTime),
    [new Date("2026-11-02T09:30:00.000-05:00").toISOString()],
  );
});

test("gives classes at the same time their own jobs, in a steady order", () => {
  const first = entry({ id: "a", title: "Physics", weekdays: [4] });
  const second = entry({ id: "b", title: "Chemistry", weekdays: [4] });
  const jobs = reminderJobs([second, first], tuesday);
  assert.deepEqual(
    jobs.map((job) => job.classId),
    ["a", "b"],
  );
  assert.equal(new Set(keys(jobs)).size, 2);
});

test("arrive-by can fall on the previous day", () => {
  const late = entry({
    id: "late",
    title: "Night lab",
    weekdays: [2],
    startsAt: "00:10",
    minutesEarly: 30,
  });
  const [job] = reminderJobs([late], at("2026-10-26T12:00"));
  assert.equal(
    job.startTime,
    new Date("2026-10-27T00:10:00.000-04:00").toISOString(),
  );
  assert.equal(
    job.arriveBy,
    new Date("2026-10-26T23:40:00.000-04:00").toISOString(),
  );
});
