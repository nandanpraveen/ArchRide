import assert from "node:assert/strict";
import test from "node:test";
import { DateTime } from "ts-luxon";
import type { ClassEntry } from "../../src/app/classes/next-class";
import { planReminderSync, reminderJobs, type ReminderJob } from "../../src/lib/class-reminders";

// Dates used: Tue Oct 27, Thu Oct 29, Sat Oct 31, Sun Nov 1, Mon Nov 2 2026.
// Daylight saving ends Sun Nov 1 2026 (New York goes from -04:00 to -05:00).

const at = (iso: string, zone = "America/New_York") => DateTime.fromISO(iso, { zone });
const keys = (jobs: ReminderJob[]) => jobs.map((job) => job.jobKey);

const entry = (overrides: Partial<ClassEntry> & Pick<ClassEntry, "id" | "title">): ClassEntry => ({
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

// What task 10 would hold after scheduling every job we asked for.
const stored = (classes: ClassEntry[], now = tuesday) => keys(reminderJobs(classes, now));

test("creates a job for each meeting in the next 7 days, keeping campus wall-clock time across daylight saving", () => {
  const jobs = reminderJobs([calculus], tuesday);
  assert.deepEqual(
    jobs.map((job) => job.startTime),
    ["2026-10-29T09:30:00.000-04:00", "2026-11-02T09:30:00.000-05:00"],
  );
  assert.deepEqual(
    jobs.map((job) => job.arriveBy),
    ["2026-10-29T09:15:00.000-04:00", "2026-11-02T09:15:00.000-05:00"],
  );
  assert.equal(jobs[0].classId, "calc");
  assert.equal(jobs[0].title, "Calculus");
  assert.equal(jobs[0].buildingName, "Test Building");
});

test("keeps the same wall-clock time on the day daylight saving ends", () => {
  const sunday = entry({ id: "sun", title: "Seminar", weekdays: [7] });
  const [job] = reminderJobs([sunday], at("2026-10-31T12:00"));
  assert.equal(job.startTime, "2026-11-01T09:30:00.000-05:00");
  assert.equal(job.arriveBy, "2026-11-01T09:15:00.000-05:00");
});

test("uses campus time when the phone is in another timezone", () => {
  // 09:00 in Tokyo on Tue Oct 27 is still Mon Oct 26 evening on campus.
  const tokyo = reminderJobs([calculus], at("2026-10-27T09:00", "Asia/Tokyo"));
  const campus = reminderJobs([calculus], at("2026-10-26T20:00"));
  assert.deepEqual(tokyo, campus);
  assert.equal(tokyo[0].startTime, "2026-10-29T09:30:00.000-04:00");
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
    ["2026-11-02T09:30:00.000-05:00"],
  );
});

test("gives classes at the same time their own jobs, in a steady order", () => {
  const first = entry({ id: "a", title: "Physics", weekdays: [4] });
  const second = entry({ id: "b", title: "Chemistry", weekdays: [4] });
  const jobs = reminderJobs([second, first], tuesday);
  assert.deepEqual(jobs.map((job) => job.classId), ["a", "b"]);
  assert.equal(new Set(keys(jobs)).size, 2);
});

test("arrive-by can fall on the previous day", () => {
  const late = entry({ id: "late", title: "Night lab", weekdays: [2], startsAt: "00:10", minutesEarly: 30 });
  const [job] = reminderJobs([late], at("2026-10-26T12:00"));
  assert.equal(job.startTime, "2026-10-27T00:10:00.000-04:00");
  assert.equal(job.arriveBy, "2026-10-26T23:40:00.000-04:00");
});

test("the first sync schedules everything and cancels nothing", () => {
  const wanted = reminderJobs([calculus], tuesday);
  assert.deepEqual(planReminderSync([], wanted), { cancel: [], schedule: wanted });
});

test("an unchanged schedule needs no work", () => {
  const wanted = reminderJobs([calculus], tuesday);
  assert.deepEqual(planReminderSync(stored([calculus]), wanted), { cancel: [], schedule: [] });
});

for (const [change, edited] of [
  ["start time", { startsAt: "10:00" }],
  ["building", { buildingId: "other-building", buildingName: "Other Building" }],
  ["title", { title: "Calculus II" }],
  ["arrive-early minutes", { minutesEarly: 5 }],
] as const) {
  test(`editing the ${change} cancels the old reminders and schedules new ones`, () => {
    const before = stored([calculus]);
    const wanted = reminderJobs([{ ...calculus, ...edited }], tuesday);
    const plan = planReminderSync(before, wanted);
    assert.deepEqual(plan.cancel.sort(), [...before].sort());
    assert.deepEqual(keys(plan.schedule), keys(wanted));
  });
}

for (const [change, classes] of [
  ["disabling the class", [{ ...calculus, enabled: false }]],
  ["turning its reminder off", [{ ...calculus, reminderEnabled: false }]],
  ["deleting the class", []],
] as const) {
  test(`${change} cancels its reminders`, () => {
    const before = stored([calculus]);
    const plan = planReminderSync(before, reminderJobs([...classes], tuesday));
    assert.deepEqual(plan.cancel.sort(), [...before].sort());
    assert.deepEqual(plan.schedule, []);
  });
}

test("removing a weekday cancels only that day's reminder", () => {
  const before = stored([calculus]);
  const mondayOnly = { ...calculus, weekdays: [1] };
  const plan = planReminderSync(before, reminderJobs([mondayOnly], tuesday));
  assert.equal(plan.cancel.length, 1);
  assert.match(plan.cancel[0], /:2026-10-29:/);
  assert.deepEqual(plan.schedule, []);
});

test("adding a weekday schedules only the new day", () => {
  const withFriday = { ...calculus, weekdays: [1, 4, 5] };
  const plan = planReminderSync(stored([calculus]), reminderJobs([withFriday], tuesday));
  assert.deepEqual(plan.cancel, []);
  assert.deepEqual(plan.schedule.map((job) => job.startTime), ["2026-10-30T09:30:00.000-04:00"]);
});

test("editing one class leaves another class's reminders alone", () => {
  const english = entry({ id: "eng", title: "English", weekdays: [2], startsAt: "11:00" });
  const before = stored([calculus, english]);
  const plan = planReminderSync(before, reminderJobs([calculus, { ...english, startsAt: "12:00" }], tuesday));
  assert.ok(plan.cancel.length > 0);
  assert.ok(plan.cancel.every((key) => key.startsWith("eng:")));
  assert.ok(plan.schedule.every((job) => job.classId === "eng"));
});

test("a meeting that has started drops out and the window picks up the next one", () => {
  const before = stored([calculus]);
  const plan = planReminderSync(before, reminderJobs([calculus], at("2026-10-29T09:31")));
  assert.equal(plan.cancel.length, 1);
  assert.match(plan.cancel[0], /:2026-10-29:/);
  assert.deepEqual(plan.schedule.map((job) => job.startTime), ["2026-11-05T09:30:00.000-05:00"]);
});
