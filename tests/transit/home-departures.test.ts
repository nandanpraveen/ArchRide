import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/supabase/database.types";
import { readHomeDepartures, readStopArrivals } from "../../src/lib/transit/read";

const now = Date.parse("2026-10-21T12:00:00Z");
const stamp = (offset = 0) => new Date(now + offset).toISOString();
const arrival = (id: string, extra: Record<string, unknown> = {}) => ({
  id, stop_id: "stop-a", trip_id: "trip-a", route_id: "route-a",
  instance_key: "source-instance", stop_sequence: 1,
  relationship: "SCHEDULED", provenance: "source",
  arrival_at: stamp(60_000), update_timestamp: stamp(), valid_until: stamp(120_000),
  ...extra,
});

// Exercise the real Supabase client against a deterministic PostgREST boundary.
function database(tables: Record<string, Record<string, unknown>[]>, brokenStop?: string, failTrips = false) {
  const urls: URL[] = [];
  const db = createClient<Database>("https://database.example.test", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      init?.signal?.throwIfAborted();
      const url = new URL(String(input));
      assert.equal(url.hostname, "database.example.test");
      assert.equal(init?.method, "GET");
      assert(init?.signal instanceof AbortSignal);
      urls.push(url);
      const table = url.pathname.split("/").at(-1)!;
      if ((brokenStop && url.searchParams.get("stop_id") === `eq.${brokenStop}`) || (failTrips && table === "transit_trips")) {
        return Response.json({ message: "Read denied" }, { status: 403 });
      }
      let rows = [...(tables[table] ?? [])];
      for (const [column, filter] of url.searchParams) {
        if (filter.startsWith("eq.")) rows = rows.filter((row) => String(row[column]) === filter.slice(3));
        else if (filter.startsWith("gte.")) rows = rows.filter((row) => String(row[column]) >= filter.slice(4));
        else if (filter.startsWith("lte.")) rows = rows.filter((row) => String(row[column]) <= filter.slice(4));
        else if (filter.startsWith("gt.")) rows = rows.filter((row) => String(row[column]) > filter.slice(3));
        else if (filter.startsWith("in.(")) {
          const ids = filter.slice(4, -1).split(",").map((id) => id.replace(/^"|"$/g, ""));
          rows = rows.filter((row) => ids.includes(String(row[column])));
        }
      }
      const order = url.searchParams.get("order")?.split(",").map((item) => item.split(".")[0]) ?? [];
      rows.sort((a, b) => {
        for (const key of order) {
          const compared = String(a[key]).localeCompare(String(b[key]));
          if (compared) return compared;
        }
        return 0;
      });
      const limit = url.searchParams.get("limit");
      return Response.json(limit ? rows.slice(0, Number(limit)) : rows);
    } },
  });
  return { db, urls };
}

test("source validity is filtered before the first three arrivals, so invalid earlier candidates cannot hide departures", async () => {
  const { db } = database({ transit_arrivals: [
    arrival("derived", { provenance: "estimated", arrival_at: stamp(1_000) }),
    arrival("future-clock", { update_timestamp: stamp(121_000), arrival_at: stamp(2_000) }),
    arrival("cancelled", { relationship: "CANCELED", arrival_at: stamp(3_000) }),
    arrival("expired", { valid_until: stamp(), arrival_at: stamp(4_000) }),
    arrival("stale", { update_timestamp: stamp(-181_000), arrival_at: stamp(5_000) }),
    arrival("past", { arrival_at: stamp(-1) }),
    arrival("valid-3", { arrival_at: stamp(90_000) }),
    arrival("valid-1"),
    arrival("valid-2", { arrival_at: stamp(75_000), stop_sequence: 3 }),
    arrival("valid-4", { arrival_at: stamp(100_000) }),
  ] });
  const result = await readStopArrivals(db, "stop-a", now);
  assert.equal(result.error, null);
  assert.deepEqual(result.data?.map((row) => row.id), ["valid-1", "valid-2", "valid-3"]);
  assert.deepEqual(result.data?.map((row) => row.stop_sequence), [1, 3, 1]);
});

test("Home departures preserve source instance/occurrence identity and real direction metadata across at most three distinct stops", async () => {
  const { db, urls } = database({
    transit_arrivals: [
      arrival("first"),
      arrival("loop-return", { stop_sequence: 3, arrival_at: stamp(90_000) }),
      arrival("other-instance", { stop_id: "stop-b", instance_key: "second-instance" }),
      arrival("unknown-trip", { stop_id: "stop-c", trip_id: "missing-trip" }),
    ],
    transit_trips: [{ id: "trip-a", route_id: "route-a", headsign: "Northbound Loop", direction_id: 0, active: true }],
  });
  const results = await readHomeDepartures(db, ["stop-a", "stop-a", "stop-b", "stop-c", "stop-d"], now);
  assert.deepEqual(results.map((result) => result.stopId), ["stop-a", "stop-b", "stop-c"]);
  assert.deepEqual(results[0].arrivals.map((row) => [row.id, row.stop_sequence, row.headsign, row.direction_id]), [
    ["first", 1, "Northbound Loop", 0], ["loop-return", 3, "Northbound Loop", 0],
  ]);
  assert.equal(results[1].arrivals[0].instance_key, "second-instance");
  assert.equal(results[2].arrivals[0].headsign, null);
  assert.equal(results[2].arrivals[0].direction_id, null);
  assert(results.every((result) => !result.error));
  assert.equal(urls.filter((url) => url.pathname.endsWith("transit_trips")).length, 1);
});

test("a stop read failure remains distinct from a successful empty prediction response", async () => {
  const { db } = database({ transit_arrivals: [arrival("available")] }, "broken");
  const results = await readHomeDepartures(db, ["stop-a", "empty", "broken"], now);
  assert.equal(results[0].arrivals.length, 1);
  assert.deepEqual(results[1], { stopId: "empty", arrivals: [], error: false });
  assert.deepEqual(results[2], { stopId: "broken", arrivals: [], error: true });
});

test("missing or mismatched trip metadata stays unknown, and a metadata outage marks affected stops only", async () => {
  const mismatched = database({
    transit_arrivals: [arrival("available")],
    transit_trips: [{ id: "trip-a", route_id: "other-route", headsign: "Wrong direction", direction_id: 1, active: true }],
  });
  const [unknown] = await readHomeDepartures(mismatched.db, ["stop-a"], now);
  assert.equal(unknown.arrivals[0].headsign, null);
  assert.equal(unknown.arrivals[0].direction_id, null);
  const failed = database({ transit_arrivals: [arrival("available")] }, undefined, true);
  const results = await readHomeDepartures(failed.db, ["stop-a", "empty"], now);
  assert.equal(results[0].error, true);
  assert.equal(results[0].arrivals[0].headsign, null);
  assert.deepEqual(results[1], { stopId: "empty", arrivals: [], error: false });
});

test("caller cancellation reaches pending public reads and cannot turn them into a successful empty result", async () => {
  const controller = new AbortController();
  let started!: () => void;
  const pending = new Promise<void>((resolve) => { started = resolve; });
  const db = createClient<Database>("https://database.example.test", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (_input, init) => {
      const signal = init?.signal;
      assert(signal instanceof AbortSignal);
      started();
      return new Promise<Response>((_resolve, reject) => {
        if (signal.aborted) reject(signal.reason);
        else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    } },
  });
  const result = readHomeDepartures(db, ["stop-a"], now, controller.signal);
  await pending;
  controller.abort();
  assert.deepEqual(await result, [{ stopId: "stop-a", arrivals: [], error: true }]);
});
