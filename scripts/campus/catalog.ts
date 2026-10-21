import type { TablesInsert } from "../../src/lib/supabase/database.types";

export const CAMPUS_SERVICE = "https://maps.itos.uga.edu/arcgis/rest/services/OUA/UGA_CampusMap_Base/MapServer";
export const PROPERTY_LAYER = "https://services2.arcgis.com/PYn6bWCjT6bhw1z3/arcgis/rest/services/UGA_Property/FeatureServer/0";
// App scope selected from published property NAME values, not a claimed university boundary.
export const CAMPUS_PROPERTIES = ["Main Campus", "Health Sciences Campus", "Chicopee Complex", "Riverbend Research Park", "River's Crossing", "School of Social Work"] as const;
export const ATTRIBUTION = "Campus location data: University of Georgia Office of University Architects (UGA GIS). Student-built, noncommercial; no university endorsement.";

// Source-verified common names; keyed by GIS identity so duplicate names never acquire another building's alias.
export const VERIFIED_ALIASES: Record<string, { expectedName: string; names: string[]; source: string }> = {
  "419c278a-d6de-49a6-a29d-f45f797fee2d": { expectedName: "Zell B. Miller Learning Center", names: ["MLC", "Miller Learning Center"], source: "https://libraries.uga.edu/mlc/teaching-learning" },
  "5ce32087-17c1-4575-82cd-f0c4339e053d": { expectedName: "Science Learning Center", names: ["SLC"], source: "https://transitions.uga.edu/transition-guide/get-started/" },
  "cbb7a17b-9768-4300-8166-8386804fac13": { expectedName: "Boyd Rsrch and Edu Ctr", names: ["Boyd Research and Education Center", "George Hugh Boyd Research and Education Center", "Boyd Center"], source: "https://brand.uga.edu/writing-style/styleguide/george_hugh_boyd_research_and_education_center/" },
};

export type SourceFeature = {
  attributes: Record<string, unknown>;
  geometry?: { x?: number; y?: number; rings?: number[][][] };
};
export type SourceSnapshot = { buildings: SourceFeature[]; doors: SourceFeature[]; properties: SourceFeature[]; fetchedAt: string };
export type CampusCatalog = {
  buildings: TablesInsert<"transit_buildings">[];
  entrances: TablesInsert<"transit_entrances">[];
  report: {
    fetchedAt: string;
    attribution: string;
    selectedPropertyNames: readonly string[];
    sourceCounts: { buildings: number; doors: number; properties: number };
    importedCounts: { buildings: number; entrances: number };
    skipped: Record<string, number>;
    missingSelectedProperties: string[];
  };
};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
function uuid(value: unknown): string | null {
  const valueText = text(value).replace(/[{}]/g, "").toLowerCase();
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(valueText) ? valueText : null;
}
const coordinates = (x: unknown, y: unknown): x is number => typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) <= 180 && Math.abs(y) <= 90;

/** Odd-even polygon membership handles disjoint rings and holes regardless of winding. */
export function pointInProperty(x: number, y: number, rings: number[][][]): boolean {
  let inside = false;
  for (const ring of rings) {
    if (ring.length < 4 || !ring.every((p) => coordinates(p[0], p[1])) || ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) throw new Error("invalid_property_geometry");
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = ring[j], [bx, by] = ring[i];
      const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
      const extent = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
      if (extent > 0 && Math.abs(cross) <= 1e-10 * extent && x >= Math.min(ax, bx) - 1e-10 && x <= Math.max(ax, bx) + 1e-10 && y >= Math.min(ay, by) - 1e-10 && y <= Math.max(ay, by) + 1e-10) return true;
      if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
    }
  }
  return inside;
}

export function normalizeCampus(snapshot: SourceSnapshot): CampusCatalog {
  if (!Number.isFinite(Date.parse(snapshot.fetchedAt))) throw new Error("invalid_fetch_time");
  const skipped: Record<string, number> = {};
  const skip = (reason: string) => { skipped[reason] = (skipped[reason] || 0) + 1; };
  const selected = snapshot.properties.filter((p) => (CAMPUS_PROPERTIES as readonly string[]).includes(text(p.attributes.NAME)));
  const missing = CAMPUS_PROPERTIES.filter((name) => !selected.some((p) => text(p.attributes.NAME) === name));
  if (missing.length) throw new Error(`missing_property:${missing.join(",")}`);
  if (selected.some((p) => !p.geometry?.rings?.length)) throw new Error("missing_property_geometry");
  // Verify every ring even if its polygon would not be reached by a point's short-circuit.
  selected.forEach((p) => pointInProperty(0, 0, p.geometry!.rings!));
  const inCampus = (x: number, y: number) => selected.some((p) => pointInProperty(x, y, p.geometry!.rings!));
  const buildings: CampusCatalog["buildings"] = [];
  const buildingNumbers = new Map<string, SourceFeature[]>();
  const imported = new Map<string, string>();
  const seenBuildings = new Set<string>();
  for (const feature of snapshot.buildings) {
    const number = text(feature.attributes.NUMBER);
    if (number) buildingNumbers.set(number, [...(buildingNumbers.get(number) || []), feature]);
  }
  for (const feature of snapshot.buildings) {
    const a = feature.attributes, globalId = uuid(a.GlobalID), name = text(a.NAME), x = a.X_DD, y = a.Y_DD;
    if (!globalId) { skip("building_invalid_id"); continue; }
    if (seenBuildings.has(globalId)) throw new Error("duplicate_building_global_id");
    seenBuildings.add(globalId);
    if (!name || /^(unknown|unnamed|null|n\/a)$/i.test(name)) { skip("building_unnamed"); continue; }
    if (a.SUBTYPE !== 1) { skip("building_not_current"); continue; }
    if (!coordinates(x, y)) { skip("building_invalid_coordinates"); continue; }
    if (!inCampus(x, y as number)) { skip("building_outside_selected_properties"); continue; }
    const id = `uga-oua:building:${globalId}`;
    const number = text(a.NUMBER), address = text(a.ADDRESS);
    const knownAliases = VERIFIED_ALIASES[globalId];
    const verifiedAliases = knownAliases?.expectedName === name ? knownAliases : null;
    const aliases = [...new Set([number, number ? `Building ${number}` : "", address, ...(verifiedAliases?.names || [])].filter(Boolean))];
    buildings.push({ id, name, aliases, longitude: x, latitude: y as number, verified_at: snapshot.fetchedAt,
      provenance: JSON.stringify({ source: `${CAMPUS_SERVICE}/7`, sourceGlobalId: globalId, buildingNumber: number || null, sourceUpdatedAt: typeof a.LASTUPDATE === "number" ? new Date(a.LASTUPDATE).toISOString() : null, coordinateKind: "published_building_reference_point", aliasSource: verifiedAliases?.source || null, fetchedAt: snapshot.fetchedAt, attribution: ATTRIBUTION }) });
    imported.set(globalId, id);
  }
  const entrances: CampusCatalog["entrances"] = [];
  const seenDoors = new Set<string>();
  for (const feature of snapshot.doors) {
    const a = feature.attributes, globalId = uuid(a.GlobalID), x = feature.geometry?.x, y = feature.geometry?.y;
    if (!globalId) { skip("entrance_invalid_id"); continue; }
    if (seenDoors.has(globalId)) throw new Error("duplicate_entrance_global_id");
    seenDoors.add(globalId);
    if (!coordinates(x, y)) { skip("entrance_invalid_coordinates"); continue; }
    if (!inCampus(x, y as number)) { skip("entrance_outside_selected_properties"); continue; }
    const matches = buildingNumbers.get(text(a.BUILDING)) || [];
    if (!matches.length) { skip("entrance_unmatched_building_number"); continue; }
    if (matches.length > 1) { skip("entrance_ambiguous_building_number"); continue; }
    const parentId = imported.get(uuid(matches[0].attributes.GlobalID) || "");
    if (!parentId) { skip("entrance_parent_not_imported"); continue; }
    entrances.push({ id: `uga-oua:entrance:${globalId}`, building_id: parentId,
      name: `${text(matches[0].attributes.NAME)} — mapped automatic door`, latitude: y as number, longitude: x,
      accessible: null,
      provenance: JSON.stringify({ source: `${CAMPUS_SERVICE}/1`, sourceGlobalId: globalId, sourceBuildingNumber: text(a.BUILDING), coordinateKind: "source_automatic_door_point", sourceUpdatedAt: typeof a.LASTUPDATE === "number" ? new Date(a.LASTUPDATE).toISOString() : null, fetchedAt: snapshot.fetchedAt, accessibility: "not_asserted", attribution: ATTRIBUTION }) });
  }
  buildings.sort((a, b) => a.id.localeCompare(b.id));
  entrances.sort((a, b) => a.id.localeCompare(b.id));
  if (!buildings.length) throw new Error("empty_campus_catalog");
  return { buildings, entrances, report: { fetchedAt: snapshot.fetchedAt, attribution: ATTRIBUTION, selectedPropertyNames: CAMPUS_PROPERTIES, sourceCounts: { buildings: snapshot.buildings.length, doors: snapshot.doors.length, properties: snapshot.properties.length }, importedCounts: { buildings: buildings.length, entrances: entrances.length }, skipped, missingSelectedProperties: [...missing] } };
}

const sqlLiteral = (value: unknown) => `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
export function campusSql(catalog: CampusCatalog): string {
  const stamp = catalog.report.fetchedAt;
  if (!Number.isFinite(Date.parse(stamp))) throw new Error("invalid_catalog_time");
  return `-- Reviewed UGA OUA campus catalog. Public source upserts only; no deletions or privilege changes.
begin;
select pg_advisory_xact_lock(71481922);
do $$ begin
 if exists(select 1 from public.feed_status where id='uga-campus:catalog' and last_success_at > '${new Date(stamp).toISOString()}'::timestamptz) then raise exception 'newer_campus_catalog_already_applied'; end if;
end $$;
insert into public.transit_buildings(id,name,aliases,latitude,longitude,provenance,verified_at)
select id,name,aliases,latitude,longitude,provenance,verified_at from jsonb_to_recordset(${sqlLiteral(catalog.buildings)}) as r(id text,name text,aliases text[],latitude double precision,longitude double precision,provenance text,verified_at timestamptz)
on conflict(id) do update set name=excluded.name,aliases=excluded.aliases,latitude=excluded.latitude,longitude=excluded.longitude,provenance=excluded.provenance,verified_at=excluded.verified_at;
insert into public.transit_entrances(id,building_id,name,latitude,longitude,accessible,provenance)
select id,building_id,name,latitude,longitude,accessible,provenance from jsonb_to_recordset(${sqlLiteral(catalog.entrances)}) as r(id text,building_id text,name text,latitude double precision,longitude double precision,accessible boolean,provenance text)
on conflict(id) do update set building_id=excluded.building_id,name=excluded.name,latitude=excluded.latitude,longitude=excluded.longitude,accessible=excluded.accessible,provenance=excluded.provenance;
insert into public.feed_status(id,state,last_attempt_at,last_success_at,source_timestamp,entity_count,error_code,updated_at)
values('uga-campus:catalog','healthy','${new Date(stamp).toISOString()}','${new Date(stamp).toISOString()}',null,${catalog.buildings.length + catalog.entrances.length},null,'${new Date(stamp).toISOString()}')
on conflict(id) do update set state=excluded.state,last_attempt_at=excluded.last_attempt_at,last_success_at=excluded.last_success_at,source_timestamp=excluded.source_timestamp,entity_count=excluded.entity_count,error_code=null,updated_at=excluded.updated_at;
commit;
`;
}
