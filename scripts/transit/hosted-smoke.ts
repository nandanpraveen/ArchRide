// Uses a disposable email account and publishable key. No administrator credential is read or printed.
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/supabase/database.types";
import { searchPlaces } from "../../src/lib/campus-data";
import { publicTransitClient } from "../../src/lib/supabase/public";
import { authClient } from "../../src/lib/supabase/auth";
async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  assert(url && key);
  const auth = authClient();
  assert(auth && process.env.ARCHRIDE_TEST_EMAIL && process.env.ARCHRIDE_TEST_PASSWORD);
  const signedIn = await auth.auth.signInWithPassword({email:process.env.ARCHRIDE_TEST_EMAIL,password:process.env.ARCHRIDE_TEST_PASSWORD});
  assert.ifError(signedIn.error);
  const token = signedIn.data.session?.access_token;
  assert(token);
  const db = publicTransitClient();
  assert(db);
  const direct = createClient<Database>(url, key, {
    accessToken: async () => null,
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const routes = await db
    .from("transit_routes")
    .select("id")
    .eq("active", true).limit(1000);
  assert.ifError(routes.error);
  assert(routes.data.length);
  const stops = await db.from("transit_stops").select("id").eq("active", true).limit(1000);
  assert.ifError(stops.error);
  assert(stops.data.length);
  const denied: number[] = [], authenticatedPrivate: {table:string;status:number;ownedRows:number}[] = [];
  for (const table of [
    "transit_routes", "transit_stops", "profiles", "saved_items", "classes",
    "active_trips", "notifications", "transit_observations", "transit_job_runs", "transit_retention",
  ] as const) {
    const result = await direct.from(table).select("*").limit(1);
    assert.equal(result.error?.code, "42501");
    denied.push(result.status);
    const authenticated: Response = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, {headers:{apikey:key,Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});
    const rows: unknown = await authenticated.json();
    if (["profiles","saved_items","classes","active_trips","notifications"].includes(table) && authenticated.ok) {
      assert(Array.isArray(rows));
      assert(rows.every(row => row[table === "profiles" ? "id" : "user_id"] === signedIn.data.user.id),`private row ownership ${table}`);
      authenticatedPrivate.push({table,status:authenticated.status,ownedRows:rows.length});
    } else {
      assert.equal(authenticated.status,403,`authenticated direct read ${table}`);
      assert.equal((rows as {code:string}).code,"42501");
      authenticatedPrivate.push({table,status:authenticated.status,ownedRows:0});
    }
  }
  const search = await searchPlaces("Memorial");
  assert.equal(search.status, "ok");
  assert(search.status === "ok" && search.places.length > 0);
  const probes: Record<string, number> = {};
  async function probe(name: string, path: string, expected: number, init?: RequestInit) {
    const response = await fetch(url + path, {
      ...init,
      headers: { apikey: key!, Authorization: `Bearer ${token}`, ...init?.headers },
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(response.status, expected, name);
    probes[name] = response.status;
    await response.body?.cancel();
  }
  const proxy = (path: string) => "/functions/v1/public-read?" + new URLSearchParams({ path });
  await probe("signed_out_read", proxy("/rest/v1/transit_routes?select=id&limit=1"), 401, {headers:{Authorization:""}});
  await probe("forged_session_read", proxy("/rest/v1/transit_routes?select=id&limit=1"), 401, {headers:{Authorization:`Bearer ${token.slice(0,-8)}forgedxx`}});
  await probe("private_proxy_read", proxy("/rest/v1/profiles?select=*"), 400);
  await probe("relation_embedding", proxy("/rest/v1/transit_routes?select=*,profiles(*)"), 400);
  await probe("unbounded_read", proxy("/rest/v1/transit_routes?limit=1001"), 400);
  await probe("proxy_mutation", proxy("/rest/v1/transit_routes?select=id"), 405, { method: "POST" });
  await probe("untrusted_origin", proxy("/rest/v1/transit_routes?select=id"), 403, { headers: { Origin: "https://untrusted.example" } });
  for (const worker of ["transit-ingest", "predictor-update", "admin-operations", "delete-account"])
    await probe(`unauthenticated_${worker}`, `/functions/v1/${worker}`, 401, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "" }, body: "{}" });
  await probe("public_health", "/functions/v1/health", 200, {headers:{Authorization:""}});
  await auth.auth.signOut({scope:"local"});
  await probe("revoked_session_read", proxy("/rest/v1/transit_routes?select=id&limit=1"), 401);
  const evidence = {
    checkedAt: new Date().toISOString(),
    project: "yivnryjbzhampecphlgr",
    authenticatedRoutes: routes.data.length,
    authenticatedStops: stops.data.length,
    directBypassAndPrivateReadStatuses: denied,
    authenticatedDirectAccess: authenticatedPrivate,
    homeSearch: "passed",
    probes,
    scope: "Disposable account sign-in/out, bounded transit reads and rejection probes; no travel records modified.",
  };
  await writeFile(
    "docs/evidence/hosted-public-security.json",
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(JSON.stringify(evidence));
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "smoke_failed");
  process.exitCode = 1;
});
