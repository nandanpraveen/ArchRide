import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPublicTransit } from "../../src/lib/transit/public-data";
import { searchPlaces } from "../../src/lib/campus-data";

test("independent public catalog failures retain useful data and search covers paged official locations", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://snapshot.example.test";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "public-test-key";
  let failed = new Set<string>();
  const stamp = new Date().toISOString();
  const tables: Record<string, Record<string, unknown>[]> = {
    transit_routes: [{ id: "route", active: true }],
    transit_stops: [{ id: "stop", name: "Campus Stop", active: true, latitude: 33.95, longitude: -83.37 }],
    transit_vehicles: [{ id: "vehicle" }],
    transit_alerts: [{ id: "alert", active: true }],
    feed_status: [{ id: "uga-passio:static", last_success_at: stamp }],
    transit_buildings: Array.from({ length: 1201 }, (_, i) => ({ id: String(i).padStart(4, "0"), name: `Official Building ${i}`, aliases: [], latitude: 33.95, longitude: -83.37 })),
    transit_entrances: [],
  };
  const requestedOffsets: number[] = [];
  const requestedTables: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "snapshot.example.test");
    assert.equal(init?.method, "GET");
    init?.signal?.throwIfAborted();
    const table = url.pathname.split("/").at(-1)!;
    requestedTables.push(table);
    if (failed.has(table)) return Response.json({ message: "unavailable" }, { status: 403 });
    let rows = tables[table] ?? [];
    for (const [key, value] of url.searchParams) {
      if (value.startsWith("eq.")) rows = rows.filter((row) => String(row[key]) === value.slice(3));
    }
    const offset = Number(url.searchParams.get("offset") || 0);
    if (table === "transit_buildings") requestedOffsets.push(offset);
    const limit = Number(url.searchParams.get("limit") || rows.length);
    return Response.json(rows.slice(offset, offset + limit));
  };
  try {
    const first = await loadPublicTransit(new AbortController().signal);
    assert.equal(first.stops[0].id, "stop");
    assert.deepEqual(first.errors, {});
    requestedTables.length = 0;
    const live = await loadPublicTransit(new AbortController().signal, first, {catalog:false,alerts:false});
    assert.deepEqual([...requestedTables].sort(),["feed_status","transit_vehicles"]);
    assert.equal(live.routes,first.routes);
    assert.equal(live.alerts,first.alerts);
    failed = new Set(["transit_alerts", "transit_vehicles"]);
    const partial = await loadPublicTransit(new AbortController().signal, first);
    assert.equal(partial.stops[0].id, "stop");
    assert.equal(partial.routes[0].id, "route");
    assert.equal(partial.alerts[0].id, "alert");
    assert(partial.errors?.alerts && partial.errors.vehicles);
    const result = await searchPlaces("Official Building 1200");
    assert.equal(result.status, "ok");
    assert(result.status === "ok" && result.places.some((place) => place.id === "1200"));
    assert(requestedOffsets.includes(1000));
    failed = new Set(["transit_entrances", "feed_status"]);
    const incomplete = await searchPlaces("Campus Stop");
    assert(incomplete.status === "ok" && incomplete.places[0].type === "stop");
    assert(incomplete.status === "ok" && incomplete.warning && incomplete.updatedAt === null);
    failed = new Set(["transit_stops", "transit_buildings", "transit_entrances"]);
    assert.equal((await searchPlaces("Campus Stop")).status, "unavailable");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey;
  }
});
