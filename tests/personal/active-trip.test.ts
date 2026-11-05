import assert from "node:assert/strict";
import test from "node:test";
import { activeTripTiming, mergeActiveArrivals, recoveryOrigin, relevantTripAlerts } from "../../src/lib/active-trip";
import { validActive, type ActiveTrip } from "../../src/lib/personal";
import type { Arrival } from "../../src/lib/transit/contracts";
import { transitFixtures } from "../e2e/transit-fixtures";

const now = Date.parse("2026-11-03T18:00:00Z");
const at = (seconds: number) => new Date(now + seconds * 1000).toISOString();
const place = (id: string) => ({ id, name: id, type: "stop" as const });
const trip: ActiveTrip = {
  origin: place("origin"), destination: place("destination"), mode: "bus", step: 0,
  instanceKey: "selected-instance", tripId: "uga-passio:trip", boardingSequence: 3, alightingSequence: 5,
  boarding: place("uga-passio:east"), alighting: place("uga-passio:east"),
  routeName: "Campus Loop", headsign: "Northbound", deadline: at(1800), expiresAt: at(10800),
  selectedBoardingAt: at(600), selectedDestinationArrivalAt: at(1320), walkToSeconds: 120, walkFromSeconds: 120,
};
const row = (overrides: Partial<Arrival> = {}): Arrival => ({
  ...transitFixtures().transit_arrivals[0], id: "board", instance_key: trip.instanceKey!, trip_id: trip.tripId!,
  stop_id: trip.boarding!.id, stop_sequence: 3, arrival_at: at(600), departure_at: null,
  update_timestamp: at(0), source_timestamp: at(0), received_at: at(1), valid_until: at(90), ...overrides,
});
const rows = [row(), row({ id: "exit", stop_sequence: 5, arrival_at: at(1200) })];

test("active trip rechecks the exact instance and repeated stop occurrences, including full destination arrival", () => {
  assert(validActive(trip, now));
  const timing = activeTripTiming(trip, [
    ...rows,
    row({ id: "other-instance", instance_key: "other", relationship: "CANCELED" }),
    row({ id: "earlier-visit", stop_sequence: 1, relationship: "CANCELED" }),
  ], true, 180, now);
  assert.equal(timing.state, "live");
  assert.equal(timing.boardingAt, at(600));
  assert.equal(timing.arrivalAt, at(1320));
  assert.equal(timing.assessment?.status, "on_time");
  assert.equal(timing.changeMinutes, null);
  assert.equal(activeTripTiming({ ...trip, alightingSequence: 7 }, rows, true, 180, now).state, "missing");
});

test("expired, disconnected and old cancellation evidence never supplies live timing or a cancellation claim", () => {
  assert.equal(activeTripTiming(trip, rows, false, 180, now).state, "stale");
  assert.equal(activeTripTiming(trip, rows, true, 180, now + 91000).state, "stale");
  const staleCancellation = rows.map((r) => ({ ...r, relationship: "CANCELED" as const, update_timestamp: at(-100) }));
  assert.equal(activeTripTiming(trip, staleCancellation, true, 180, now).state, "stale");
  assert.equal(activeTripTiming(trip, [row({ relationship: "CANCELED" })], true, 180, now).state, "cancelled");
  assert.equal(activeTripTiming(trip, [], true, 180, now).state, "missing");
  assert.equal(activeTripTiming(trip, rows, true, 180, now + 10800001).state, "expired");
});

test("confirmed boarding removes the boarding-time dependency, and material changes recompute deadline status", () => {
  const changed = [row({ id: "exit", stop_sequence: 5, arrival_at: at(1800) })];
  const timing = activeTripTiming({ ...trip, step: 2 }, changed, true, 180, now);
  assert.equal(timing.state, "live");
  assert.equal(timing.boardingAt, null);
  assert.equal(timing.changeMinutes, 10);
  assert.equal(timing.assessment?.status, "likely_late");
  assert.equal(activeTripTiming(trip, [row({ arrival_at: at(200) }), rows[1]], true, 180, now).state, "unreachable");
  assert.equal(activeTripTiming({ ...trip, step: 1 }, [row({ arrival_at: at(200) }), rows[1]], true, 180, now).state, "live");
  assert.equal(activeTripTiming({ ...trip, step: 3 }, [], false, 180, now).state, "walking");
  assert.equal(activeTripTiming({ ...trip, step: 3 }, [], false, 180, now).arrivalAt, null);
});

test("backward responses cannot restore older estimates; a missing row retains only its original validity", () => {
  const latest = row({ update_timestamp: at(10), arrival_at: at(700) });
  assert.equal(mergeActiveArrivals([latest], [row()])[0].arrival_at, at(700));
  assert.deepEqual(mergeActiveArrivals([latest], []), [latest]);
  assert.equal(activeTripTiming(trip, mergeActiveArrivals(rows, []), true, 180, now + 91000).arrivalAt, null);
});

test("recovery uses only student-confirmed location and metadata is bounded", () => {
  assert.equal(recoveryOrigin(trip), null);
  assert.deepEqual(recoveryOrigin({ ...trip, step: 1 }), trip.boarding);
  assert.equal(recoveryOrigin({ ...trip, step: 2 }), null);
  assert.deepEqual(recoveryOrigin({ ...trip, step: 3 }), trip.alighting);
  assert(!validActive({ ...trip, walkToSeconds: -1 }, now));
  assert(!validActive({ ...trip, alightingSequence: 2 }, now));
});

test("trip alerts match route AND stop restrictions and stop affecting the trip at expiry", () => {
  const fixture = transitFixtures(), route = fixture.transit_routes[0], stop = fixture.transit_stops[0];
  const base = { ...fixture.transit_alerts[0], active_periods: [{ start: now / 1000 - 60, end: now / 1000 + 60 }] };
  const alerts = [
    { ...base, id: "global" },
    { ...base, id: "matched", informed_entities: [{ routeId: "r", stopId: "east" }] },
    { ...base, id: "wrong-stop", informed_entities: [{ routeId: "r", stopId: "west" }] },
    { ...base, id: "wrong-route", informed_entities: [{ routeId: "other" }] },
  ];
  assert.deepEqual(relevantTripAlerts(alerts, route, [stop], trip.tripId, now).map((a) => a.id), ["global", "matched"]);
  assert.equal(relevantTripAlerts(alerts, route, [stop], trip.tripId, now + 60000).length, 0);
});
