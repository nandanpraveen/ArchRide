import type { Page, Route } from "@playwright/test";

export function transitFixtures() {
  const now = Date.now();
  const stamp = new Date(now).toISOString();
  const feed = (kind: string) => ({ id: `uga-passio:${kind}`, state: "healthy", last_success_at: stamp, source_timestamp: stamp, updated_at: stamp, entity_count: 2, error_code: null as string | null, next_attempt_at: null });
  const stop = (id: string, name: string, latitude: number) => ({ id: `uga-passio:${id}`, source_id: "uga-passio", source_id_raw: id, name, latitude, longitude: -83.377, location_type: 0, parent_station: null, active: true });
  const trip = { id: "uga-passio:trip", source_id: "uga-passio", source_id_raw: "trip", route_id: "uga-passio:r", service_id: "uga-passio:service", shape_id: "uga-passio:shape", direction_id: 0, headsign: "Northbound Loop", active: true };
  const arrival = { id: "arrival1", source_id: "uga-passio", trip_id: trip.id, instance_key: "test-instance", route_id: trip.route_id, stop_id: "uga-passio:east", stop_sequence: 1, arrival_at: new Date(now + 300_000).toISOString(), departure_at: null, uncertainty_seconds: null, relationship: "SCHEDULED", source_timestamp: stamp, received_at: stamp, update_timestamp: stamp, timestamp_kind: "trip", provenance: "source", valid_until: new Date(now + 180_000).toISOString() };
  const alert = { id: "notice", source_id: "uga-passio", source_id_raw: "notice", header: "Board at the signed stop", description: "Use the marked boarding point.", url: null, cause: null, effect: null, active_periods: [], informed_entities: [], source_timestamp: stamp, received_at: stamp, active: true, provenance: "source" };
  return {
    transit_routes: [{ id: trip.route_id, source_id: "uga-passio", source_id_raw: "r", short_name: "L", long_name: "Campus Loop", color: "CC0000", text_color: "FFFFFF", active: true }],
    transit_stops: [stop("east", "Memorial Hall", 33.948), stop("west", "Memorial Hall", 33.95), stop("south", "Science Center", 33.94)],
    feed_status: [feed("static"), feed("vehicles"), feed("arrivals"), feed("alerts")],
    transit_buildings: [{ id: "building", name: "Mémorial Building", aliases: ["Student Center"], latitude: 33.948, longitude: -83.377, provenance: "test-fixture", verified_at: stamp }],
    transit_entrances: [],
    transit_vehicles: [{ id: "uga-passio:v", source_id: "uga-passio", source_id_raw: "v", route_id: trip.route_id, trip_id: trip.id, instance_key: "test-instance", stop_id: "uga-passio:east", stop_sequence: 1, latitude: 33.948, longitude: -83.377, bearing: null, speed: null, source_timestamp: stamp, received_at: stamp, position_timestamp: new Date(now - 600_000).toISOString(), position_timestamp_kind: "vehicle", current_status: "STOPPED_AT" }],
    transit_trips: [trip],
    transit_stop_times: [1, 2, 3].map((seq) => ({ id: `occurrence${seq}`, trip_id: trip.id, stop_id: seq === 2 ? "uga-passio:west" : "uga-passio:east", stop_sequence: seq, arrival_seconds: 86400 + seq * 60, departure_seconds: 86400 + seq * 60, pickup_type: 0, drop_off_type: 0 })),
    transit_shapes: [{ id: "uga-passio:shape", points: [[-83.377, 33.948], [-83.377, 33.95], [-83.377, 33.948]] }],
    transit_services: [{ id: trip.service_id, calendar: { monday: "1", tuesday: "1", wednesday: "1", thursday: "1", friday: "1", saturday: "0", sunday: "0" }, exceptions: [] }],
    transit_arrivals: [arrival, { ...arrival, id: "cancelled", relationship: "CANCELED" }, { ...arrival, id: "old", update_timestamp: new Date(now - 600_000).toISOString() }],
    transit_alerts: [alert, { ...alert, id: "future", header: "Future notice hidden", active_periods: [{ start: now / 1000 + 3600 }] }, { ...alert, id: "expired", header: "Expired notice hidden", active_periods: [{ end: now / 1000 - 1 }] }],
  };
}

export async function mockTransit(page: Page, tables: Record<string, unknown[]> = transitFixtures(), override?: (route: Route) => Promise<boolean>) {
  await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
  await page.route("**/functions/v1/public-read?**", async (route) => {
    const original = route;
    const endpoint = new URL(original.request().url());
    const decoded = new URL(endpoint.searchParams.get("path") || "/rest/v1/invalid", endpoint.origin);
    route = new Proxy(original, { get(target, name) {
      if (name === "request") return () => new Proxy(target.request(), { get(request, key) {
        if (key === "url") return () => decoded.href;
        if (key === "headers") return () => ({ ...request.headers(), ...(endpoint.searchParams.get("single") === "true" ? { accept: "application/vnd.pgrst.object+json" } : {}) });
        const value = Reflect.get(request, key); return typeof value === "function" ? value.bind(request) : value;
      } });
      const value = Reflect.get(target, name); return typeof value === "function" ? value.bind(target) : value;
    } });
    if (override && await override(route)) return;
    const url = new URL(route.request().url());
    const table = url.pathname.split("/").at(-1)!;
    let rows = [...(tables[table] ?? [])] as Record<string, unknown>[];
    for (const [key, value] of url.searchParams) {
      if (value.startsWith("eq.")) rows = rows.filter((r) => String(r[key]) === value.slice(3));
      else if (value.startsWith("in.(")) { const ids = value.slice(4, -1).split(",").map((s) => s.replace(/^"|"$/g, "")); rows = rows.filter((r) => ids.includes(String(r[key]))); }
      else if (value.startsWith("gte.")) rows = rows.filter((r) => String(r[key]) >= value.slice(4));
      else if (value.startsWith("lte.")) rows = rows.filter((r) => String(r[key]) <= value.slice(4));
      else if (value.startsWith("gt.")) rows = rows.filter((r) => String(r[key]) > value.slice(3));
    }
    const offset = Number(url.searchParams.get("offset") || 0);
    const limit = Number(url.searchParams.get("limit") || rows.length);
    rows = rows.slice(offset, offset + limit);
    const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,OPTIONS" };
    if (route.request().method() === "OPTIONS") { await route.fulfill({ status: 204, headers }); return; }
    await route.fulfill({ json: route.request().headers().accept?.includes("application/vnd.pgrst.object") ? rows[0] ?? null : rows, headers });
  });
}
