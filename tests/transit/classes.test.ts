import assert from "node:assert/strict";
import test from "node:test";
import getNextOccurrence, { type ClassEntry } from "../../src/app/classes/next-class";

const entry = (changes: Partial<ClassEntry> = {}): ClassEntry => ({
  id: "1", buildingId: "test-building", buildingName: "Test Building", minutesEarly: 0, reminderEnabled: false, title: "Calculus", weekdays: [1, 3], startsAt: "09:30", enabled: true, ...changes,
});

test("next class skips disabled, invalid and passed starts and advances a campus week", () => {
  const now = Date.parse("2026-10-28T14:00:00Z");
  const classes = [entry(), entry({ id: "2", startsAt: "10:30", enabled: false }),
    entry({ id: "3", startsAt: "25:00" }), entry({ id: "4", startsAt: "11:00" })];
  assert.equal(getNextOccurrence(classes, now)?.classEntry.id, "4");
  assert.equal(getNextOccurrence(classes, now)?.startTime, "2026-10-28T15:00:00.000Z");
  assert.equal(getNextOccurrence([entry()], now)?.startTime, "2026-11-02T14:30:00.000Z");
  assert.equal(getNextOccurrence([], now), null);
  assert.equal(getNextOccurrence([entry()], NaN), null);
});

test("class weekdays use campus dates when UTC has already reached the next day", () => {
  assert.equal(getNextOccurrence([entry({ weekdays: [3], startsAt: "21:00" })],
    Date.parse("2026-10-29T00:00:00Z"))?.startTime, "2026-10-29T01:00:00.000Z");
});

test("recurring class times skip spring gaps and select a future fall-fold occurrence", () => {
  assert.equal(getNextOccurrence([entry({ weekdays: [7], startsAt: "02:30" })],
    Date.parse("2026-03-08T05:00:00Z"))?.startTime, "2026-03-15T06:30:00.000Z");
  assert.equal(getNextOccurrence([entry({ weekdays: [7], startsAt: "01:30" })],
    Date.parse("2026-11-01T05:45:00Z"))?.startTime, "2026-11-01T06:30:00.000Z");
});
