import assert from "node:assert/strict";
import test from "node:test";
import { staticCatalog, context, normalize } from "../../scripts/transit/model";
import { arrivalEstimate } from "../../src/lib/transit/estimates";
import type { Tables } from "../../src/lib/supabase/database.types";
import { archive, message, update, vehicle, NOW, epoch } from "./fixtures";
const fixed = (overrides: Record<string, string> = {}) => context(staticCatalog(archive({
  "frequencies.txt": "trip_id,start_time,end_time,headway_secs,exact_times\n",
  "stop_times.txt": "trip_id,arrival_time,departure_time,stop_id,stop_sequence\nt,12:00:00,12:00:00,a,1\nt,12:10:00,12:10:00,b,2\nt,12:20:00,12:20:00,a,3\n",
  ...overrides,
})));
const implicit = (time = epoch, extra: Record<string, unknown> = {}) => update(time, {
  trip: { tripId: "t", routeId: "r" }, vehicle: { id: "bus" },
  stopTimeUpdate: [
    { stopSequence: 1, stopId: "a", arrival: { time: time + 300 } },
    { stopSequence: 3, stopId: "a", arrival: { time: time + 900 } },
  ], ...extra,
});

test("real-feed shape: fixed trips without optional dates/times retain absolute source ETAs and match vehicle identity", () => {
  const c = fixed(), arrival = normalize("arrivals", message([implicit()]), c, NOW);
  assert.equal(arrival.rejected, 0); assert.equal(arrival.rows.length, 2);
  assert.equal(arrival.rows[0].instance_key, "uga-passio:t|20261017|12:00:00|vehicle:bus");
  assert.equal(arrival.rows[0].arrival_at, new Date(NOW + 300000).toISOString());
  assert.equal(arrival.rows[0].update_timestamp, new Date(NOW).toISOString());
  assert.equal(arrivalEstimate(arrival.rows[0] as Tables<"transit_arrivals">, NOW).state, "valid");
  assert.equal(arrivalEstimate(arrival.rows[0] as Tables<"transit_arrivals">, NOW + 91000).state, "stale");
  assert.notEqual(arrival.rows[0].id, arrival.rows[1].id); // Same physical stop, distinct occurrences.
  const positions = normalize("vehicles", message([vehicle(epoch, { trip: { tripId: "t", routeId: "r" }, vehicle: { id: "bus" } })]), c, NOW);
  assert.equal(positions.rows[0].instance_key, arrival.rows[0].instance_key);
  assert.equal(positions.events[0].instance_key, arrival.rows[0].instance_key);
});

test("frequency templates keep explicit instance requirements and unresolved vehicles never create arrival ground truth", () => {
  const c = context(staticCatalog(archive()));
  assert.throws(() => normalize("arrivals", message([implicit()]), c, NOW), /all_entities_rejected/);
  const position = normalize("vehicles", message([vehicle(epoch, { trip: { tripId: "t", routeId: "r" } })]), c, NOW);
  assert.equal(position.rows.length, 1); assert.equal(position.rows[0].instance_key, null); assert.equal(position.events.length, 0);
});

test("implicit fixed dates reject midnight crossings, overnight service, DST folds, closed calendars and competing descriptors", () => {
  const midnight = Date.parse("2026-10-18T03:58:00Z");
  assert.throws(() => normalize("arrivals", message([implicit(midnight / 1000)], midnight / 1000), fixed(), midnight), /all_entities_rejected/);
  const overnight = fixed({ "stop_times.txt": "trip_id,arrival_time,departure_time,stop_id,stop_sequence\nt,24:01:00,24:01:00,a,1\nt,25:01:00,25:01:00,a,3\n" });
  assert.throws(() => normalize("arrivals", message([implicit()]), overnight, NOW), /all_entities_rejected/);
  const fold = Date.parse("2026-11-01T05:30:00Z");
  assert.throws(() => normalize("arrivals", message([implicit(fold / 1000)], fold / 1000), fixed(), fold), /all_entities_rejected/);
  const closed = fixed({ "calendar.txt": "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\ns,1,1,1,1,1,0,0,20260101,20261231\n" });
  assert.throws(() => normalize("arrivals", message([implicit()]), closed, NOW), /all_entities_rejected/);
  assert.throws(() => normalize("arrivals", message([implicit(), { ...implicit(epoch, { vehicle: { id: "other-bus" } }), id: "second" }]), fixed(), NOW), /all_entities_rejected/);
});

test("an explicit service date can identify a fixed overnight trip without a start-time field", () => {
  const c = fixed({ "stop_times.txt": "trip_id,arrival_time,departure_time,stop_id,stop_sequence\nt,24:01:00,24:01:00,a,1\nt,25:01:00,25:01:00,a,3\n" });
  const overnightNow = Date.parse("2026-10-18T04:02:00Z");
  const row = normalize("arrivals", message([implicit(overnightNow / 1000, { trip: { tripId: "t", routeId: "r", startDate: "20261017" } })], overnightNow / 1000), c, overnightNow).rows[0];
  assert.equal(row.instance_key, "uga-passio:t|20261017|24:01:00|vehicle:bus");
  assert.equal(row.update_timestamp, new Date(overnightNow).toISOString());
});

test("fixed instance resolution needs a verified first departure and a real service date", () => {
  const missing = fixed({ "stop_times.txt": "trip_id,arrival_time,departure_time,stop_id,stop_sequence\nt,12:00:00,,a,1\nt,12:20:00,12:20:00,a,3\n" });
  assert.throws(() => normalize("arrivals", message([implicit()]), missing, NOW), /all_entities_rejected/);
  assert.throws(() => normalize("arrivals", message([implicit(epoch, { trip: { tripId: "t", routeId: "r", startDate: "20260230", startTime: "12:00:00" } })]), fixed(), NOW), /all_entities_rejected/);
});
