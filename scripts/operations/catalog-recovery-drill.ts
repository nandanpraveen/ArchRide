/** Read-only live public-catalog export, restored into a fresh disposable PostgreSQL database. */
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { localDatabase } from "../transit/local-db";
async function main() {
const tables = ["transit_sources", "transit_buildings", "transit_entrances", "transit_routes", "transit_stops", "transit_shapes", "transit_services", "transit_trips", "transit_stop_times", "transit_frequencies", "feed_status"] as const;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error("The public Supabase URL and publishable key are required.");
const snapshot: Record<string, unknown[]> = {};
for (const table of tables) {
  const rows: unknown[] = [];
  for (let start = 0; ; start += 1000) {
    const response = await fetch(`${url}/functions/v1/public-read?${new URLSearchParams({ path: `/rest/v1/${table}?select=*&order=id&offset=${start}&limit=1000` })}`, { headers: { apikey: key }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Public export failed for ${table}: HTTP ${response.status}`);
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error(`Unexpected export for ${table}.`);
    rows.push(...page);
    if (page.length < 1000) break;
    if (start >= 100000) throw new Error("Catalog export exceeds the supported drill size.");
  }
  snapshot[table] = rows;
}
await mkdir(".secrets", { recursive: true, mode: 0o700 });
const bytes = JSON.stringify(snapshot), sha256 = createHash("sha256").update(bytes).digest("hex");
await writeFile(".secrets/public-catalog-recovery.json", bytes + "\n", { mode: 0o600 });
const { engine } = await localDatabase();
const counts: Record<string, number> = {};
try {
  for (const table of tables) {
    if (!snapshot[table].length) { counts[table] = 0; continue; }
    await engine.query(`insert into public.${table} select * from jsonb_populate_recordset(null::public.${table}, $1::jsonb) on conflict(id) do update set ${Object.keys(snapshot[table][0] ?? {}).filter(k => k !== "id" && /^[a-z_]+$/.test(k)).map(k => `${k}=excluded.${k}`).join(",")}`, [JSON.stringify(snapshot[table])]);
    const count = Number((await engine.query<{ count: number }>(`select count(*) as count from public.${table}`)).rows[0].count);
    if (count !== snapshot[table].length) throw new Error(`Restored row count differs for ${table}.`);
    counts[table] = count;
  }
  await engine.exec("set role anon");
  let readDenied = false;
  try { await engine.query("select * from public.transit_routes"); } catch { readDenied = true; }
  if (!readDenied) throw new Error("Direct anonymous reads bypass the admitted public endpoint.");
  let denied = false;
  try { await engine.exec("update public.transit_routes set long_name='Forged'"); } catch { denied = true; }
  if (!denied) throw new Error("Restored catalog write protection failed.");
} finally { await engine.close(); }
const evidence = { checkedAt: new Date().toISOString(), scope: "Live public static catalog and health only. This is not an Auth/private-data/Vault disaster-recovery drill.", source: url, sha256, counts, restoredInto: "Fresh disposable PGlite PostgreSQL with all portable checked-in migrations", admittedPublicExportVerified: true, directAnonymousReadDenied: true, anonymousWriteDenied: true, productionWrites: false, snapshotPath: ".secrets/public-catalog-recovery.json" };
await mkdir("docs/evidence", { recursive: true });
await writeFile("docs/evidence/catalog-recovery-drill.json", JSON.stringify(evidence, null, 2) + "\n");
console.log(JSON.stringify(evidence, null, 2));

}
void main().catch(error => { console.error(error.message); process.exitCode = 1; });
