import assert from "node:assert/strict";
import test from "node:test";
import type { ArrivalEstimate } from "../../src/lib/transit/estimates";
import { determineNotifSignaling, leaveNowReminder, type WatchedBus } from "../../src/lib/leave-now";
import { DEFAULT_PREFERENCES, isInAppLink } from "../../src/lib/notifications";

// A usable bus estimate; each test overrides only what it is about.
const estimate = (overrides: Partial<ArrivalEstimate> = {}): ArrivalEstimate => ({
  provenance: "source",
  arrivalAt: "2026-10-30T12:05:00.000Z",
  sourceTime: "2026-10-30T12:00:00.000Z",
  receivedAt: "2026-10-30T12:00:01.000Z",
  validUntil: "2026-10-30T12:10:00.000Z",
  state: "valid",
  reason: "Source estimate; actual arrival may differ.",
  countdownMinutes: 3,
  ...overrides,
});

test("prompts when the bus is closer than the lead time", () => {
  assert.equal(
    determineNotifSignaling(estimate({ countdownMinutes: 3 }), 5),
    "Your bus is 3 minutes away. Leave now if you want to catch it!",
  );
});

test("prompts when the bus is exactly at the lead time", () => {
  assert.match(determineNotifSignaling(estimate({ countdownMinutes: 5 }), 5) ?? "", /^Your bus is 5 minutes away/);
});

test("waits when the bus is farther away than the lead time", () => {
  assert.equal(determineNotifSignaling(estimate({ countdownMinutes: 6 }), 5), null);
  assert.equal(determineNotifSignaling(estimate({ countdownMinutes: 12 }), 5), null);
});

test("uses the student's own lead time", () => {
  const eightAway = estimate({ countdownMinutes: 8 });
  assert.equal(determineNotifSignaling(eightAway, 5), null);
  assert.match(determineNotifSignaling(eightAway, 10) ?? "", /^Your bus is 8 minutes away/);
});

test("says '1 minute' in the singular", () => {
  assert.match(determineNotifSignaling(estimate({ countdownMinutes: 1 }), 5) ?? "", /^Your bus is 1 minute away\./);
});

test("a bus arriving right now still prompts", () => {
  assert.match(determineNotifSignaling(estimate({ countdownMinutes: 0 }), 5) ?? "", /^Your bus is 0 minutes away/);
});

test("stays quiet when there is no estimate", () => {
  assert.equal(determineNotifSignaling(null, 5), null);
});

for (const state of ["stale", "missing", "passed"] as const) {
  test(`stays quiet for a ${state} estimate, even if its old countdown looks close`, () => {
    assert.equal(determineNotifSignaling(estimate({ state, countdownMinutes: 2 }), 5), null);
  });
}

test("stays quiet when a valid estimate somehow has no countdown", () => {
  assert.equal(determineNotifSignaling(estimate({ countdownMinutes: null }), 5), null);
});

test("tells the student when the bus is cancelled", () => {
  assert.equal(
    determineNotifSignaling(estimate({ state: "cancelled", countdownMinutes: null }), 5),
    "Bus watch cancelled.",
  );
});

// leaveNowReminder: the whole decision for one watched bus.
const watch: WatchedBus = { arrivalId: "run-1|stop-1", tripId: "trip-9", stopId: "stop-3", routeName: "Route L", stopName: "Tate Center" };
const NOW = Date.parse("2026-10-30T12:00:00.000Z");
const remind = (est: ArrivalEstimate | null, handled: string[] = [], prefs = DEFAULT_PREFERENCES) =>
  leaveNowReminder(watch, est, prefs, new Set(handled), NOW);

test("creates a leave-now notification that lasts 10 minutes past the predicted arrival", () => {
  assert.deepEqual(remind(estimate({ countdownMinutes: 3 })), {
    type: "leave_now",
    title: "Your bus is 3 minutes away. Leave now if you want to catch it!",
    body: "Route L at Tate Center",
    link: "/map?stop=stop-3",
    dedupeKey: "leave:run-1|stop-1",
    expiresAt: "2026-10-30T12:15:00.000Z",
  });
});

test("creates nothing when the bus is too far away, stale, or there is no estimate", () => {
  assert.equal(remind(estimate({ countdownMinutes: 9 })), null);
  assert.equal(remind(estimate({ state: "stale", countdownMinutes: 2 })), null);
  assert.equal(remind(null), null);
});

test("creates nothing when the student turned leave-now reminders off", () => {
  assert.equal(remind(estimate({ countdownMinutes: 3 }), [], { ...DEFAULT_PREFERENCES, leaveNowEnabled: false }), null);
});

test("uses the student's own lead time", () => {
  const eightAway = estimate({ countdownMinutes: 8 });
  assert.equal(remind(eightAway), null);
  assert.equal(remind(eightAway, [], { ...DEFAULT_PREFERENCES, busLeadMinutes: 10 })?.dedupeKey, "leave:run-1|stop-1");
});

test("does not create a reminder that was already handled, even if it was cleared", () => {
  assert.equal(remind(estimate({ countdownMinutes: 3 }), ["leave:run-1|stop-1"]), null);
});

test("a handled reminder for one bus or stop does not block another", () => {
  const close = estimate({ countdownMinutes: 3 });
  assert.equal(remind(close, ["leave:trip-8:stop-3"])?.dedupeKey, "leave:run-1|stop-1");
  assert.equal(remind(close, ["leave:trip-9:stop-4"])?.dedupeKey, "leave:run-1|stop-1");
});

test("the notification links to the stop's details, encoding the stop id", () => {
  const colonStop: WatchedBus = { ...watch, stopId: "uga-passio:east" };
  const reminder = leaveNowReminder(colonStop, estimate({ countdownMinutes: 3 }), DEFAULT_PREFERENCES, new Set(), NOW);
  assert.equal(reminder?.link, "/map?stop=uga-passio%3Aeast");
  // The database only accepts in-app paths, so the link must pass the same rule.
  assert.equal(isInAppLink(reminder?.link), true);
});

test("a stop id cannot turn the link into an outside address", () => {
  const sneaky: WatchedBus = { ...watch, stopId: "//evil.example/x?y=" };
  const reminder = leaveNowReminder(sneaky, estimate({ countdownMinutes: 3 }), DEFAULT_PREFERENCES, new Set(), NOW);
  assert.equal(reminder?.link, "/map?stop=%2F%2Fevil.example%2Fx%3Fy%3D");
  assert.equal(isInAppLink(reminder?.link), true);
});

test("a cancellation notice lasts 30 minutes from now, even with no arrival time", () => {
  const cancelled = estimate({ state: "cancelled", countdownMinutes: null, arrivalAt: null });
  assert.deepEqual(remind(cancelled), {
    type: "leave_now",
    title: "Bus watch cancelled.",
    body: "Route L at Tate Center",
    link: "/map?stop=stop-3",
    dedupeKey: "cancel:run-1|stop-1",
    expiresAt: "2026-10-30T12:30:00.000Z",
  });
});

test("a cancellation still arrives after a leave-now prompt, but only once", () => {
  const cancelled = estimate({ state: "cancelled", countdownMinutes: null });
  assert.equal(remind(cancelled, ["leave:run-1|stop-1"])?.dedupeKey, "cancel:run-1|stop-1");
  assert.equal(remind(cancelled, ["cancel:run-1|stop-1"]), null);
});

test("creates nothing for a close bus that has no arrival time", () => {
  assert.equal(remind(estimate({ countdownMinutes: 3, arrivalAt: null })), null);
});

test("a later run of the same trip and stop gets its own reminder", () => {
  const laterRun = { ...watch, arrivalId: "run-2|stop-1" };
  assert.equal(leaveNowReminder(laterRun, estimate(), DEFAULT_PREFERENCES,
    new Set(["leave:run-1|stop-1"]), NOW)?.dedupeKey, "leave:run-2|stop-1");
});
