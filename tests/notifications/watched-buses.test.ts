import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import type { Arrival } from "../../src/lib/transit/contracts";
import {
  MAX_WATCHED_BUSES,
  WATCH_LIFETIME_MS,
  addWatched,
  isWatched,
  pickWatchedEstimate,
  pruneHandled,
  pruneWatched,
  readDeviceHandled,
  readDeviceWatched,
  removeWatched,
  shouldStopWatching,
  writeDeviceHandled,
  writeDeviceWatched,
  type WatchedBusEntry,
} from "../../src/lib/watched-buses";

const NOW = Date.parse("2026-10-30T12:00:00.000Z");
const iso = (offsetMinutes: number) => new Date(NOW + offsetMinutes * 60_000).toISOString();

const bus = { arrivalId: "run-1|stop-1", tripId: "trip-9", stopId: "stop-3", routeName: "Route L", stopName: "Tate Center" };

// A live prediction for the watched bus, updated just now.
const row = (overrides: Partial<Arrival> = {}): Arrival => ({
  id: "a1",
  source_id: "uga-passio",
  trip_id: "trip-9",
  instance_key: "i1",
  route_id: "route-l",
  stop_id: "stop-3",
  stop_sequence: 1,
  arrival_at: iso(4),
  departure_at: null,
  uncertainty_seconds: null,
  relationship: "SCHEDULED",
  source_timestamp: iso(0),
  received_at: iso(0),
  update_timestamp: iso(0),
  timestamp_kind: "trip",
  provenance: "source",
  valid_until: iso(3),
  ...overrides,
});

test("watching a bus adds it once", () => {
  const once = addWatched([], bus, NOW);
  assert.deepEqual(once, [{ ...bus, addedAt: NOW }]);
  assert.equal(addWatched(once, bus, NOW + 1000), once);
  assert.equal(isWatched(once, bus), true);
  assert.equal(isWatched(once, { ...bus, stopId: "other" }), false);
});

test("the same trip at another stop is a separate watch", () => {
  const list = addWatched(addWatched([], bus, NOW), { ...bus, stopId: "stop-4" }, NOW);
  assert.equal(list.length, 2);
});

test("different runs and stop occurrences of the same scheduled trip stay separate", () => {
  const first = addWatched([], bus, NOW);
  const second = { ...bus, arrivalId: "run-2|stop-1" };
  const list = addWatched(first, second, NOW);
  assert.equal(list.length, 2);
  assert.deepEqual(removeWatched(list, bus).map((entry) => entry.arrivalId), [second.arrivalId]);
});

test("at the limit the oldest watch makes room for the newest", () => {
  let list: WatchedBusEntry[] = [];
  for (let i = 0; i < MAX_WATCHED_BUSES + 2; i++) list = addWatched(list, { ...bus, tripId: `trip-${i}` }, NOW + i);
  assert.equal(list.length, MAX_WATCHED_BUSES);
  assert.equal(list[0].tripId, "trip-2");
  assert.equal(list.at(-1)?.tripId, `trip-${MAX_WATCHED_BUSES + 1}`);
});

test("very long names are shortened so the notification body stays within its limit", () => {
  const [entry] = addWatched([], { ...bus, routeName: "R".repeat(300), stopName: "S".repeat(300) }, NOW);
  assert.equal(entry.routeName.length, 80);
  assert.equal(entry.stopName.length, 80);
});

test("unwatching removes only that bus", () => {
  const list = addWatched(addWatched([], bus, NOW), { ...bus, tripId: "trip-1" }, NOW);
  assert.deepEqual(removeWatched(list, bus).map((item) => item.tripId), ["trip-1"]);
});

test("a watch is forgotten after its lifetime", () => {
  const list = addWatched([], bus, NOW);
  assert.equal(pruneWatched(list, NOW + WATCH_LIFETIME_MS - 1).length, 1);
  assert.equal(pruneWatched(list, NOW + WATCH_LIFETIME_MS).length, 0);
});

test("a live prediction becomes a valid estimate with its countdown", () => {
  const estimate = pickWatchedEstimate([row()], NOW);
  assert.equal(estimate?.state, "valid");
  assert.equal(estimate?.countdownMinutes, 4);
});

test("no rows means no estimate, which is not a cancellation", () => {
  assert.equal(pickWatchedEstimate([], NOW), null);
  assert.equal(shouldStopWatching(null), false);
});

test("a cancelled row is reported as cancelled", () => {
  assert.equal(pickWatchedEstimate([row({ relationship: "CANCELED" })], NOW)?.state, "cancelled");
});

test("a live prediction wins over a passed or old row for the same bus", () => {
  const passed = row({ id: "a0", arrival_at: iso(-2) });
  const later = row({ id: "a2", arrival_at: iso(9) });
  const estimate = pickWatchedEstimate([passed, later, row()], NOW);
  assert.equal(estimate?.state, "valid");
  assert.equal(estimate?.arrivalAt, iso(4));
});

test("when the feed is disconnected a live prediction is stale, so no countdown is trusted", () => {
  const estimate = pickWatchedEstimate([row()], NOW, false);
  assert.equal(estimate?.state, "stale");
  assert.equal(estimate?.countdownMinutes, null);
});

test("an old prediction is stale", () => {
  const old = row({ update_timestamp: iso(-30), valid_until: iso(3) });
  assert.equal(pickWatchedEstimate([old], NOW)?.state, "stale");
});

test("cancellation dispatch requires connected, fresh, unexpired source evidence", () => {
  const cancelled = row({ relationship: "CANCELED" });
  assert.equal(pickWatchedEstimate([cancelled], NOW, false)?.state, "stale");
  assert.equal(pickWatchedEstimate([{ ...cancelled, update_timestamp: iso(-30) }], NOW)?.state, "stale");
  assert.equal(pickWatchedEstimate([{ ...cancelled, valid_until: iso(0) }], NOW)?.state, "stale");
  assert.equal(pickWatchedEstimate([cancelled], NOW)?.state, "cancelled");
});

test("a passed bus stops being watched, a live or stale one does not", () => {
  assert.equal(shouldStopWatching(pickWatchedEstimate([row({ arrival_at: iso(-1) })], NOW)), true);
  assert.equal(shouldStopWatching(pickWatchedEstimate([row()], NOW)), false);
  assert.equal(shouldStopWatching(pickWatchedEstimate([row()], NOW, false)), false);
  assert.equal(shouldStopWatching(pickWatchedEstimate([row({ relationship: "CANCELED" })], NOW)), true);
});

test("handled reminders are forgotten once they would have expired", () => {
  const handled = { "leave:a:b": NOW + 1000, "leave:c:d": NOW, "cancel:e:f": NOW - 1000 };
  assert.deepEqual(pruneHandled(handled, NOW), { "leave:a:b": NOW + 1000 });
});

// A stand-in for the browser's localStorage, which Node does not have.
let store: Map<string, string>;
let failWrites = false;
beforeEach(() => {
  store = new Map();
  failWrites = false;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (failWrites) throw new Error("quota exceeded");
        store.set(key, value);
      },
    },
  });
});
afterEach(() => {
  Reflect.deleteProperty(globalThis, "localStorage");
});

test("watched buses survive a save and reload", () => {
  const list = addWatched(addWatched([], bus, NOW), { ...bus, tripId: "trip-1" }, NOW);
  assert.equal(writeDeviceWatched(list), true);
  assert.deepEqual(readDeviceWatched(), list);
});

test("watched buses read back empty when nothing valid is saved", () => {
  assert.deepEqual(readDeviceWatched(), []);
  store.set("archride.watched-buses.v1", "not json");
  assert.deepEqual(readDeviceWatched(), []);
  store.set("archride.watched-buses.v1", JSON.stringify({ not: "a list" }));
  assert.deepEqual(readDeviceWatched(), []);
});

test("edited or broken watched entries are dropped and good ones kept", () => {
  const good = { ...bus, addedAt: NOW };
  store.set(
    "archride.watched-buses.v1",
    JSON.stringify([good, null, { ...good, tripId: "" }, { ...good, stopName: 5 }, { ...good, addedAt: "yesterday" }]),
  );
  assert.deepEqual(readDeviceWatched(), [good]);
});

test("handled reminders survive a save and reload, and bad entries are dropped", () => {
  assert.equal(writeDeviceHandled({ "leave:a:b": NOW }), true);
  assert.deepEqual(readDeviceHandled(), { "leave:a:b": NOW });
  store.set("archride.handled-reminders.v1", JSON.stringify({ good: NOW, bad: "soon", worse: null }));
  assert.deepEqual(readDeviceHandled(), { good: NOW });
  store.set("archride.handled-reminders.v1", "[1,2]");
  assert.deepEqual(readDeviceHandled(), {});
  store.set("archride.handled-reminders.v1", "not json");
  assert.deepEqual(readDeviceHandled(), {});
});

test("saving reports false when the browser refuses to store the data", () => {
  failWrites = true;
  assert.equal(writeDeviceWatched([]), false);
  assert.equal(writeDeviceHandled({}), false);
});
