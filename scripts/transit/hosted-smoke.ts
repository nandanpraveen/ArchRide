// Uses only a publishable key. No administrator credential is read or printed.
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/supabase/database.types";
import { searchPlaces } from "../../src/lib/campus-data";
async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  assert(url && key);
  const db = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const routes = await db
    .from("transit_routes")
    .select("id")
    .eq("active", true);
  assert.ifError(routes.error);
  assert(routes.data.length);
  const stops = await db.from("transit_stops").select("id").eq("active", true);
  assert.ifError(stops.error);
  assert(stops.data.length);
  const denied = [];
  for (const op of [
    db.from("transit_routes").insert({ id: "__denied__" } as never),
    db
      .from("transit_routes")
      .update({ short_name: "__denied__" })
      .eq("id", "__does_not_exist__"),
    db.from("transit_routes").delete().eq("id", "__does_not_exist__"),
    db.from("transit_observations").select("id").limit(1),
    db.from("transit_job_runs").select("id").limit(1),
    db.from("transit_retention").select("id").limit(1),
  ]) {
    const result = await op;
    assert.equal(result.error?.code, "42501");
    denied.push(result.status);
  }
  const search = await searchPlaces("Memorial");
  assert.equal(search.status, "ok");
  assert(search.status === "ok" && search.places.length > 0);
  const unauth = await fetch(url + "/functions/v1/transit-ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"mode":"all"}',
  });
  assert.equal(unauth.status, 401);
  const evidence = {
    checkedAt: new Date().toISOString(),
    project: "yivnryjbzhampecphlgr",
    publicRoutes: routes.data.length,
    publicStops: stops.data.length,
    deniedWriteAndPrivateReadStatuses: denied,
    homeSearch: "passed",
    unauthenticatedWorkerStatus: unauth.status,
  };
  await writeFile(
    "docs/transit/hosted-public-smoke.json",
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(JSON.stringify(evidence));
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "smoke_failed");
  process.exitCode = 1;
});
