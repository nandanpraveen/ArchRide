import { createHash } from "node:crypto";
import { fetchFeed } from "../transit/fetch";
import { CAMPUS_PROPERTIES, CAMPUS_SERVICE, PROPERTY_LAYER, type SourceFeature, type SourceSnapshot } from "./catalog";

type ArcResponse = { error?: unknown; count?: number; features?: SourceFeature[]; exceededTransferLimit?: boolean; [key: string]: unknown };
type ReadEvidence = { url: string; bytes: number; sha256: string; featureCount?: number };
const BUILDING_ITEM = "73ddcfa0d3ab467cbc26b65a95a507aa";
const PROPERTY_ITEM = "79cd581d037142968b5d86d965430764";
const PAGE_SIZE = 500;
const MAX_FEATURES = 10_000;

export async function fetchCampusSource(options: { fetch?: typeof fetch } = {}) {
  const requests: ReadEvidence[] = [];
  async function read(url: string): Promise<ArcResponse> {
    const bytes = await fetchFeed(url, { fetch: options.fetch, maxBytes: 8_000_000 });
    const data: ArcResponse = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || typeof data !== "object" || data.error) throw new Error("campus_source_error");
    requests.push({ url, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), ...(Array.isArray(data.features) ? { featureCount: data.features.length } : {}) });
    return data;
  }
  async function query(layer: string, params: Record<string, string>) {
    return read(`${layer}/query?${new URLSearchParams({ ...params, f: "json" })}`);
  }
  async function features(layer: string, params: Record<string, string>, oid: string): Promise<SourceFeature[]> {
    const countResult = await query(layer, { where: params.where, returnCountOnly: "true" });
    const count = countResult.count;
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 1 || count > MAX_FEATURES) throw new Error("unexpected_campus_source_count");
    const rows: SourceFeature[] = [];
    for (let offset = 0; offset < count; offset += PAGE_SIZE) {
      const page = await query(layer, { ...params, resultOffset: String(offset), resultRecordCount: String(PAGE_SIZE), orderByFields: `${oid} ASC` });
      if (!Array.isArray(page.features) || page.features.length < Math.min(PAGE_SIZE, count - offset) || page.features.length > PAGE_SIZE) throw new Error("incomplete_campus_source_page");
      rows.push(...page.features);
    }
    if (rows.length !== count) throw new Error("changed_campus_source_during_read");
    return rows;
  }
  const serviceItem = await read(`https://www.arcgis.com/sharing/rest/content/items/${BUILDING_ITEM}?f=json`);
  const propertyItem = await read(`https://www.arcgis.com/sharing/rest/content/items/${PROPERTY_ITEM}?f=json`);
  for (const item of [serviceItem, propertyItem]) {
    if (item.access !== "public" || item.owner !== "Adam.Ghafourian@uga.edu" || item.licenseInfo || item.accessInformation) throw new Error("source_metadata_changed_review_required");
  }
  if (serviceItem.url !== CAMPUS_SERVICE || propertyItem.url !== PROPERTY_LAYER.replace(/\/0$/, "")) throw new Error("source_item_url_changed_review_required");
  const propertyWhere = `NAME IN (${CAMPUS_PROPERTIES.map((name) => `'${name.replace(/'/g, "''")}'`).join(",")})`;
  // Sequential bounded catalog reads. This explicit operator command installs no recurring job.
  const properties = await features(PROPERTY_LAYER, { where: propertyWhere, outFields: "FID,NAME,GlobalID,LASTUPDATE", returnGeometry: "true", outSR: "4326" }, "FID");
  const buildings = await features(`${CAMPUS_SERVICE}/7`, { where: "1=1", outFields: "OBJECTID,GlobalID,NAME,NUMBER,ADDRESS,X_DD,Y_DD,SUBTYPE,LASTUPDATE", returnGeometry: "false" }, "OBJECTID");
  const doors = await features(`${CAMPUS_SERVICE}/1`, { where: "1=1", outFields: "OBJECTID,GlobalID,BUILDING,AutoDoor,OPENTYPE,LASTUPDATE", returnGeometry: "true", outSR: "4326" }, "OBJECTID");
  const snapshot: SourceSnapshot = { buildings, doors, properties, fetchedAt: new Date().toISOString() };
  return {
    snapshot,
    evidence: {
      fetchedAt: snapshot.fetchedAt,
      authorityChain: ["https://www.architects.uga.edu/", "https://www.arcgis.com/sharing/rest/content/items/10832e7927124404a7119df52872af84/data?f=json", "https://www.arcgis.com/sharing/rest/content/items/02b6c7cef78a49e3b417dd8c310e672e/data?f=json", CAMPUS_SERVICE, PROPERTY_LAYER],
      serviceItem, propertyItem,
      useEvidence: {
        ugaSharing: "https://www.architects.uga.edu/maps",
        esriTerms: "https://doc.arcgis.com/en/arcgis-online/reference/access-use-constraints.htm",
        inference: "Public UGA-owned service items have no special terms. Esri guidance describes typical personal/noncommercial reuse and no special limitations when item terms are absent. Use here is an attributed noncommercial student project; no Creative Commons or public-domain license is asserted.",
        limits: "No numeric quota, refresh interval or availability guarantee is published. Explicit bounded operator refresh only; no visitor/provider polling. Review changed item terms before importing again.",
      },
      requests,
    },
  };
}
