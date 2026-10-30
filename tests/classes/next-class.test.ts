import assert from "node:assert/strict";
import test from "node:test";
import { DateTime } from "ts-luxon";
import getNextOccurrence, { type ClassEntry } from "../../src/app/classes/next-class";

// Dates used: Sun Oct 25, Mon Oct 26, Tue Oct 27, Thu Oct 29, Sat Oct 31 2026.
// Daylight saving ends Sun Nov 1 2026 (New York goes from -04:00 to -05:00).

const at = (iso: string, zone = "America/New_York") => DateTime.fromISO(iso, { zone });

const entry = (overrides: Partial<ClassEntry> & Pick<ClassEntry, "id" | "title">): ClassEntry => ({
  weekdays: [1, 4],
  startsAt: "09:30",
  enabled: true,
  ...overrides,
});

const calculus = entry({ id: 0, title: "Calculus", weekdays: [1, 4], startsAt: "09:30" });
const english = entry({ id: 1, title: "English", weekdays: [2], startsAt: "11:00" });

test("returns the next day this class meets", () => {
  const result = getNextOccurrence([calculus], at("2026-10-27T12:00"));
  assert.equal(result?.classEntry.title, "Calculus");
  assert.equal(result?.startTime, "2026-10-29T09:30:00.000-04:00");
});

test("returns a class later today when it has not started yet", () => {
  const result = getNextOccurrence([calculus, english], at("2026-10-27T10:00"));
  assert.equal(result?.classEntry.title, "English");
  assert.equal(result?.startTime, "2026-10-27T11:00:00.000-04:00");
});

test("rolls a class that already started today to next week", () => {
  const result = getNextOccurrence([calculus], at("2026-10-29T10:00"));
  assert.equal(result?.startTime, "2026-11-02T09:30:00.000-05:00");
});

test("treats a class starting exactly now as already started", () => {
  const result = getNextOccurrence([calculus], at("2026-10-29T09:30"));
  assert.equal(result?.startTime, "2026-11-02T09:30:00.000-05:00");
});

test("picks the earliest of several classes, skipping one that already started", () => {
  const result = getNextOccurrence([english, calculus], at("2026-10-27T12:00"));
  assert.equal(result?.classEntry.title, "Calculus");
  assert.equal(result?.startTime, "2026-10-29T09:30:00.000-04:00");
});

test("skips disabled classes", () => {
  const result = getNextOccurrence([{ ...calculus, enabled: false }, english], at("2026-10-26T08:00"));
  assert.equal(result?.classEntry.title, "English");
});

test("returns null when there are no classes", () => {
  assert.equal(getNextOccurrence([], at("2026-10-27T12:00")), null);
});

test("returns null when every class is disabled", () => {
  assert.equal(getNextOccurrence([{ ...calculus, enabled: false }], at("2026-10-27T12:00")), null);
});

test("finds a weekend class", () => {
  const saturday = entry({ id: 2, title: "Lab", weekdays: [6], startsAt: "10:00" });
  const result = getNextOccurrence([saturday], at("2026-10-27T12:00"));
  assert.equal(result?.startTime, "2026-10-31T10:00:00.000-04:00");
});

test("rolls from Sunday to Monday", () => {
  const monday = entry({ id: 3, title: "Early", weekdays: [1], startsAt: "08:00" });
  const result = getNextOccurrence([monday], at("2026-10-25T20:00"));
  assert.equal(result?.startTime, "2026-10-26T08:00:00.000-04:00");
});

test("handles a class at midnight", () => {
  const midnight = entry({ id: 4, title: "Night", weekdays: [2], startsAt: "00:00" });
  const result = getNextOccurrence([midnight], at("2026-10-26T23:59"));
  assert.equal(result?.startTime, "2026-10-27T00:00:00.000-04:00");
});

test("with overlapping classes, returns the one that starts first", () => {
  const first = entry({ id: 5, title: "First", weekdays: [4], startsAt: "09:30" });
  const overlapping = entry({ id: 6, title: "Overlap", weekdays: [4], startsAt: "10:00" });
  const result = getNextOccurrence([overlapping, first], at("2026-10-29T08:00"));
  assert.equal(result?.classEntry.title, "First");
});

test("with classes at the same time, returns the first one in the list", () => {
  const a = entry({ id: 7, title: "A", weekdays: [4], startsAt: "09:30" });
  const b = entry({ id: 8, title: "B", weekdays: [4], startsAt: "09:30" });
  assert.equal(getNextOccurrence([a, b], at("2026-10-29T08:00"))?.classEntry.title, "A");
  assert.equal(getNextOccurrence([b, a], at("2026-10-29T08:00"))?.classEntry.title, "B");
});

test("keeps the same wall-clock time across the Nov 1 daylight saving change", () => {
  const result = getNextOccurrence([calculus], at("2026-10-31T12:00"));
  assert.equal(result?.startTime, "2026-11-02T09:30:00.000-05:00");
});

test("uses campus time when the phone is in another timezone", () => {
  // Tue Oct 27 12:00 in New York is Wed Oct 28 01:00 in Tokyo.
  const afternoonEnglish = { ...english, startsAt: "14:00" };
  const result = getNextOccurrence([calculus, afternoonEnglish], at("2026-10-28T01:00", "Asia/Tokyo"));
  assert.equal(result?.classEntry.title, "English");
  assert.equal(result?.startTime, "2026-10-27T14:00:00.000-04:00");
});
