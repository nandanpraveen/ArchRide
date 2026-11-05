import { test } from "node:test";
import assert from "node:assert/strict";
import { CAMPUS_PROPERTIES, campusSql, normalizeCampus, pointInProperty, type SourceFeature, type SourceSnapshot } from "../../scripts/campus/catalog";
import { fetchCampusSource } from "../../scripts/campus/source";
import { localDatabase } from "../../scripts/transit/local-db";

// Synthetic geometry and names for validation; never imported by the production CLI.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const square = [[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]];
const building = (n: number, attributes: Record<string, unknown> = {}): SourceFeature => ({ attributes: { GlobalID: `{${id(n)}}`, NUMBER: String(n), NAME: `Synthetic O'Brien Hall ${n}`, ADDRESS: "123 Fixture Road", SUBTYPE: 1, X_DD: 1, Y_DD: 1, ...attributes } });
const door = (n: number, number: string): SourceFeature => ({ attributes: { GlobalID: id(n), BUILDING: number, AutoDoor: "Y" }, geometry: { x: 1, y: 1 } });
const snapshot = (): SourceSnapshot => ({ fetchedAt: "2026-10-21T04:00:00.000Z", properties: CAMPUS_PROPERTIES.map((name) => ({ attributes: { NAME: name }, geometry: { rings: [square] } })), buildings: [building(1)], doors: [door(10, "1")] });

test("official property polygon membership preserves holes, boundaries and disjoint parts", () => {
  const hole = [[1, 1], [1, 2], [2, 2], [2, 1], [1, 1]];
  const other = [[10, 10], [11, 10], [11, 11], [10, 11], [10, 10]];
  assert.equal(pointInProperty(0.5, 0.5, [square, hole, other]), true);
  assert.equal(pointInProperty(1.5, 1.5, [square, hole, other]), false);
  assert.equal(pointInProperty(10.5, 10.5, [square, hole, other]), true);
  assert.equal(pointInProperty(5, 2, [square]), true);
  assert.equal(pointInProperty(5.000001, 2, [square]), false);
  assert.throws(() => pointInProperty(1, 1, [[[0, 0], [5, 0], [5, 5], [0, 5]]]), /geometry/);
  assert.throws(() => pointInProperty(1, 1, [[[0, 0], [Infinity, 0], [0, 5], [0, 0]]]), /geometry/);
});

test("catalog uses published points, filters invalid records and skips ambiguous entrance joins", () => {
  const source = snapshot();
  source.buildings.push(building(2, { NUMBER: "dup" }), building(3, { NUMBER: "dup" }), building(4, { NAME: "  " }), building(5, { X_DD: NaN }), building(6, { SUBTYPE: 2 }), building(7, { X_DD: 20 }), building(8, { GlobalID: "wrong" }));
  source.doors.push(door(11, "dup"), door(12, "unknown"), { ...door(13, "1"), geometry: { x: 30, y: 30 } });
  const catalog = normalizeCampus(source);
  assert.equal(catalog.buildings.length, 3);
  assert.equal(catalog.entrances.length, 1);
  assert.equal(catalog.buildings[0].longitude, 1);
  assert.equal(catalog.entrances[0].accessible, null);
  assert.equal(catalog.entrances[0].building_id, `uga-oua:building:${id(1)}`);
  assert.ok(catalog.buildings[0].aliases?.includes("Building 1"));
  for (const reason of ["building_unnamed", "building_invalid_coordinates", "building_not_current", "building_outside_selected_properties", "building_invalid_id", "entrance_ambiguous_building_number", "entrance_unmatched_building_number", "entrance_outside_selected_properties"]) assert.equal(catalog.report.skipped[reason], 1, reason);
  assert.throws(() => normalizeCampus({ ...source, buildings: [building(1), building(1)] }), /duplicate_building/);
  assert.throws(() => normalizeCampus({ ...source, properties: source.properties.slice(1) }), /missing_property/);
});

test("verified MLC alias follows exact GIS identity and expected source name", () => {
  const source = snapshot();
  source.buildings = [building(1, { GlobalID: "{419C278A-D6DE-49A6-A29D-F45F797FEE2D}", NAME: "Zell B. Miller Learning Center" })];
  source.doors = [];
  assert.ok(normalizeCampus(source).buildings[0].aliases?.includes("MLC"));
  source.buildings[0].attributes.NAME = "Renamed building";
  assert.ok(!normalizeCampus(source).buildings[0].aliases?.includes("MLC"));
});

test("catalog SQL is atomic, replay-safe, preserves quoted names and denies older artifacts", async () => {
  const { engine } = await localDatabase();
  try {
    const catalog = normalizeCampus(snapshot());
    await engine.exec(campusSql(catalog));
    await engine.exec(campusSql(catalog));
    const rows = (await engine.query<{ name: string; aliases: string[] }>("select name,aliases from public.transit_buildings")).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, "Synthetic O'Brien Hall 1");
    assert.ok(rows[0].aliases.includes("Building 1"));
    assert.equal((await engine.query("select * from public.transit_entrances")).rows.length, 1);
    const invalid = structuredClone(catalog);
    invalid.buildings[0].name = "Must roll back";
    invalid.entrances[0].building_id = "missing-parent";
    await assert.rejects(engine.exec(campusSql(invalid)), /foreign key/);
    await engine.exec("rollback;");
    assert.equal((await engine.query<{ name: string }>("select name from public.transit_buildings")).rows[0].name, "Synthetic O'Brien Hall 1");
    const earlier = normalizeCampus({ ...snapshot(), fetchedAt: "2026-10-20T04:00:00.000Z" });
    await assert.rejects(engine.exec(campusSql(earlier)), /newer_campus_catalog/);
    await engine.exec("rollback;");
    assert.equal((await engine.query("select * from public.transit_buildings")).rows.length, 1);
    await engine.exec("set role anon;");
    await assert.rejects(engine.query("select * from public.transit_buildings"), /permission denied/);
    await assert.rejects(engine.exec("delete from public.transit_buildings"), /permission denied/);
    await engine.exec("reset role;");
  } finally { await engine.close(); }
});

test("explicit campus source fetch paginates bounded reads and records public source evidence", async () => {
  const requests: string[] = [];
  const mockFetch: typeof fetch = async (input) => {
    const url = new URL(String(input)); requests.push(url.href);
    if (url.pathname.includes("/content/items/")) return Response.json({ access: "public", owner: "Adam.Ghafourian@uga.edu", licenseInfo: null, accessInformation: null, url: url.pathname.includes("73ddc") ? "https://maps.itos.uga.edu/arcgis/rest/services/OUA/UGA_CampusMap_Base/MapServer" : "https://services2.arcgis.com/PYn6bWCjT6bhw1z3/arcgis/rest/services/UGA_Property/FeatureServer" });
    const count = url.pathname.endsWith("/7/query") ? 501 : 6;
    if (url.searchParams.has("returnCountOnly")) return Response.json({ count });
    const offset = Number(url.searchParams.get("resultOffset"));
    return Response.json({ features: Array.from({ length: Math.min(500, count - offset) }, (_, i) => building(offset + i + 1)) });
  };
  const result = await fetchCampusSource({ fetch: mockFetch });
  assert.equal(result.snapshot.buildings.length, 501);
  assert.ok(requests.some((u) => u.includes("resultOffset=500")));
  assert.equal(result.evidence.requests.length, requests.length);
  assert.ok(result.evidence.requests.every((r) => /^[a-f0-9]{64}$/.test(r.sha256)));
  assert.ok(requests.every((u) => !u.includes("passio") && !u.includes("supabase")));
  const changedTerms: typeof fetch = async () => Response.json({ access: "public", owner: "Adam.Ghafourian@uga.edu", licenseInfo: "New special terms" });
  await assert.rejects(fetchCampusSource({ fetch: changedTerms }), /metadata_changed/);
});
