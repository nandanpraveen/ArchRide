import assert from "node:assert/strict";
import test from "node:test";
import { localDatabase } from "../../scripts/transit/local-db";
import { authDestination } from "../../src/lib/auth-redirect";
import { bearerToken } from "../../supabase/functions/_shared/identity";

test("auth destinations reject external, encoded, backslash and authentication loops", () => {
  for (const value of [null, "https://evil.test", "//evil.test", "/\\evil.test", "/%2f%2fevil.test", "/sign-in", "/auth/callback", "/plan\n"]) assert.equal(authDestination(value), "/");
  assert.equal(authDestination("/plan/?to=building&toType=building"), "/plan?to=building&toType=building");
  assert.equal(bearerToken(new Request("https://app.test")), null);
  assert.equal(bearerToken(new Request("https://app.test", { headers: { authorization: "Bearer not-a-session" } })), null);
});

test("account limits follow the user across sessions and networks while retaining network protection", async () => {
  const { engine } = await localDatabase();
  const a = "10000000-0000-0000-0000-000000000001", b = "10000000-0000-0000-0000-000000000002";
  const sa = "20000000-0000-0000-0000-000000000001", sb = "20000000-0000-0000-0000-000000000002", sa2 = "20000000-0000-0000-0000-000000000003";
  const admit = async (user: string, session: string, hash = "a".repeat(64)) => (await engine.query<{allowed: boolean;retry_after: number;lease_id: string}>("select * from archride_private.admit_account_request('report',$1,$2,$3)", [hash,user,session])).rows[0];
  try {
    await engine.query("insert into auth.users(id) values($1),($2)",[a,b]);
    await engine.query("insert into auth.sessions(id,user_id) values($1,$2),($3,$4),($5,$2)",[sa,a,sb,b,sa2]);
    await engine.exec("set role service_role");
    const server = await admit(b,sb,"d".repeat(64));assert(server.allowed);
    await engine.query("delete from archride_private.request_leases where id=$1",[server.lease_id]);
    await engine.exec("reset role");
    await assert.rejects(admit(a,sb), {code:"28000"});
    for(let i=0;i<12;i++) {const r=await admit(a,sa);assert(r.allowed);await engine.query("delete from archride_private.request_leases where id=$1",[r.lease_id]);}
    const limited = await admit(a,sa2,"b".repeat(64));assert.equal(limited.allowed,false);assert(limited.retry_after>=1&&limited.retry_after<=3600);
    assert.equal((await engine.query("select * from archride_private.request_leases")).rows.length,0);
    const other=await admit(b,sb,"c".repeat(64));assert(other.allowed);await engine.query("delete from archride_private.request_leases where id=$1",[other.lease_id]);
    await engine.query("update archride_private.request_limits set hits=120 where scope='report' and key_hash=$1",["c".repeat(64)]);
    assert.equal((await admit(b,sb,"c".repeat(64))).allowed,false);
    await engine.query("delete from auth.sessions where id=$1",[sa]);await assert.rejects(admit(a,sa),{code:"28000"});
    await engine.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[sa2]);await assert.rejects(admit(a,sa2),{code:"28000"});
    await engine.exec("set role anon");await assert.rejects(engine.query("select * from archride_private.account_request_limits"),{code:"42501"});
  } finally { await engine.close(); }
});
