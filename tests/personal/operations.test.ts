import assert from "node:assert/strict";
import test from "node:test";
import { localDatabase } from "../../scripts/transit/local-db";
import { officialSource, trustedAdmin, validCorrection, validNotice } from "../../supabase/functions/admin-operations/validation";
import { tokenSessionId } from "../../supabase/functions/_shared/identity";

test("operations reject editable role metadata and invalid notices/corrections", () => {
  const forged = { id: "student", user_metadata: { admin: true }, app_metadata: { role: "admin" } };
  assert.equal(trustedAdmin(forged), false);
  assert.equal(trustedAdmin({ id: "maintainer", app_metadata: { admin: true } }), true);
  assert.equal(trustedAdmin({ id: "guest", is_anonymous: true, app_metadata: { admin: true } }), false);
  for (const url of ["http://tps.uga.edu/rules", "https://uga.edu.evil.test/rules", "https://user@uga.edu/rules", "javascript:alert(1)"]) assert.equal(officialSource(url), false);
  assert.equal(officialSource("https://tps.uga.edu/parking/"), true);
  const notice = { title: "Stop relocated", body: "Use the temporary stop.", validFrom: "2026-11-03T10:00:00Z", validUntil: "2026-11-03T11:00:00Z", sourceUrl: "https://tps.uga.edu/", routeIds: [], stopIds: [] };
  assert.equal(validNotice(notice), true);
  assert.equal(validNotice({ ...notice, validUntil: notice.validFrom }), false);
  assert.equal(validNotice({ ...notice, routeIds: Array(26).fill("route") }), false);
  assert.equal(validNotice({ ...notice, validUntil: "2027-01-01T00:00:00Z" }), false);
  const correction = { kind: "building", placeId: "place", name: "Science", latitude: 33.95, longitude: -83.37, sourceUrl: "https://www.uga.edu/" };
  assert.equal(validCorrection(correction), true);
  assert.equal(validCorrection({ ...correction, latitude: 0 }), false);
  assert.equal(validCorrection({ ...correction, kind: "stop" }), false);
  const session = "00000000-0000-0000-0000-000000000001";
  const token = `untrusted.${Buffer.from(JSON.stringify({ session_id: session })).toString("base64url")}.signature`;
  assert.equal(tokenSessionId(token), session);
  assert.equal(tokenSessionId("bad"), null);
});

test("manual notices are time scoped and browsers cannot invoke operations or overwrite catalogs", async () => {
  const { engine } = await localDatabase();
  try {
    await engine.exec(`insert into public.manual_notices(title,body,valid_from,valid_until,source_url) values
      ('Current','Current notice',now()-interval '1 hour',now()+interval '1 hour','https://tps.uga.edu/'),
      ('Expired','Old notice',now()-interval '2 hours',now()-interval '1 hour','https://tps.uga.edu/'),
      ('Future','Future notice',now()+interval '1 hour',now()+interval '2 hours','https://tps.uga.edu/');`);
    for (const role of ["anon", "authenticated"]) {
      await engine.exec(`set role ${role}`);
      await assert.rejects(engine.query("select title from public.manual_notices"), { code: "42501" });
      await assert.rejects(engine.query("update public.manual_notices set title='Forged'"), { code: "42501" });
      await assert.rejects(engine.query("delete from public.manual_notices"), { code: "42501" });
      await assert.rejects(engine.query("select * from archride_private.admin_audit"), { code: "42501" });
      await assert.rejects(engine.query("select * from archride_private.place_corrections"), { code: "42501" });
      await assert.rejects(engine.query("update public.transit_buildings set name='Forged'"), { code: "42501" });
      await engine.exec("reset role");
    }
  } finally { await engine.close(); }
});

test("verified place overrides survive imports while retaining the latest original values", async () => {
  const { engine } = await localDatabase();
  try {
    await engine.exec("insert into public.transit_buildings(id,name,latitude,longitude,provenance,verified_at) values('building:test','Original',33.95,-83.37,'UGA source',now())");
    await engine.exec("insert into archride_private.place_corrections(kind,place_id,name,latitude,longitude,source_url,source_values) values('building','building:test','Verified',33.951,-83.371,'https://www.uga.edu/',jsonb_build_object('name','Original','latitude',33.95,'longitude',-83.37,'provenance','UGA source'))");
    await engine.exec("update public.transit_buildings set name='Updated source',latitude=33.952,longitude=-83.372,provenance='Updated UGA source' where id='building:test'");
    const row = (await engine.query<{ name: string; latitude: number; provenance: string }>("select name,latitude,provenance from public.transit_buildings where id='building:test'")).rows[0];
    assert.equal(row.name, "Verified"); assert.equal(row.latitude, 33.951); assert.match(row.provenance, /maintainer correction/);
    const original = (await engine.query<{ source_values: { name: string; latitude: number } }>("select source_values from archride_private.place_corrections where place_id='building:test'")).rows[0].source_values;
    assert.equal(original.name, "Updated source"); assert.equal(original.latitude, 33.952);
  } finally { await engine.close(); }
});
