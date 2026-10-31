import assert from "node:assert/strict";
import test from "node:test";
import { describeWeekdays, validateClass, type ClassDraft } from "../../src/lib/classes";

const draft = (overrides: Partial<ClassDraft> = {}): ClassDraft => ({
  title: "Calculus",
  weekdays: [1, 4],
  startsAt: "09:30",
  enabled: true,
  buildingId: "test-building",
  buildingName: "Test Building",
  minutesEarly: 10,
  reminderEnabled: false,
  ...overrides,
});

test("accepts a complete class", () => {
  assert.deepEqual(validateClass(draft()), {});
});

test("requires a class name and rejects names over 80 characters", () => {
  assert.ok(validateClass(draft({ title: "   " })).title);
  assert.ok(validateClass(draft({ title: "x".repeat(81) })).title);
});

test("requires a verified building (missing destination)", () => {
  assert.ok(validateClass(draft({ buildingId: "" })).buildingId);
});

test("requires at least one weekday and rejects repeated or out-of-range days", () => {
  assert.ok(validateClass(draft({ weekdays: [] })).weekdays);
  assert.ok(validateClass(draft({ weekdays: [1, 1] })).weekdays);
  assert.ok(validateClass(draft({ weekdays: [0] })).weekdays);
  assert.ok(validateClass(draft({ weekdays: [8] })).weekdays);
  assert.deepEqual(validateClass(draft({ weekdays: [6, 7] })), {});
});

test("accepts only valid 24-hour HH:mm start times", () => {
  for (const good of ["00:00", "09:30", "23:59"]) assert.deepEqual(validateClass(draft({ startsAt: good })), {});
  for (const bad of ["9:30", "24:00", "12:60", "9:30 PM", ""]) assert.ok(validateClass(draft({ startsAt: bad })).startsAt, bad);
});

test("bounds minutes early to whole minutes from 0 to 60", () => {
  assert.deepEqual(validateClass(draft({ minutesEarly: 0 })), {});
  assert.deepEqual(validateClass(draft({ minutesEarly: 60 })), {});
  for (const bad of [-1, 61, 2.5, Number.NaN]) assert.ok(validateClass(draft({ minutesEarly: bad })).minutesEarly, String(bad));
});

test("describes weekdays in calendar order", () => {
  assert.equal(describeWeekdays([4, 1]), "Monday, Thursday");
});
