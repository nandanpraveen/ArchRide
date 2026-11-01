import assert from "node:assert/strict";
import test from "node:test";
import { localDatabase } from "../../scripts/transit/local-db";

test("notification migrations enforce owner CRUD, preferences upserts and immutable content", async () => {
  const { engine } = await localDatabase();
  const owner = "00000000-0000-0000-0000-0000000000a1";
  const other = "00000000-0000-0000-0000-0000000000b2";
  const insert = `insert into public.notifications(type, title, dedupe_key, expires_at)
    values ('leave_now', 'Campus Loop is close', 'run-1|stop-1', now() + interval '10 minutes')`;
  try {
    await engine.exec(`insert into auth.users(id) values ('${owner}'), ('${other}');
      set role authenticated; set request.jwt.claim.sub = '${owner}';`);
    const prefs = await engine.query<{ user_id: string; bus_lead_minutes: number }>(
      "insert into public.notification_preferences default values returning user_id, bus_lead_minutes",
    );
    assert.equal(prefs.rows[0].user_id, owner);
    assert.equal(prefs.rows[0].bus_lead_minutes, 5);
    await engine.query(`insert into public.notification_preferences(bus_lead_minutes) values (9)
      on conflict (user_id) do update set bus_lead_minutes = excluded.bus_lead_minutes`);
    assert.equal((await engine.query<{ bus_lead_minutes: number }>(
      "select bus_lead_minutes from public.notification_preferences",
    )).rows[0].bus_lead_minutes, 9);
    await assert.rejects(engine.query("update public.notification_preferences set bus_lead_minutes = 0"), { code: "23514" });
    await assert.rejects(engine.query(`update public.notification_preferences set user_id = '${other}'`), { code: "42501" });
    const added = await engine.query<{ user_id: string }>(insert + " returning user_id");
    assert.equal(added.rows[0].user_id, owner);
    await assert.rejects(engine.query(insert), { code: "23505" });
    await assert.rejects(engine.query(`insert into public.notifications(user_id, type, title, dedupe_key, expires_at)
      values ('${other}', 'alert', 'Spoof', 'spoof', now() + interval '1 minute')`), { code: "42501" });
    await assert.rejects(engine.query(`insert into public.notifications(type, title, link, dedupe_key, expires_at)
      values ('alert', 'Outside', '//example.com', 'outside', now() + interval '1 minute')`), { code: "23514" });
    await assert.rejects(engine.query(`insert into public.notifications(type, title, dedupe_key, expires_at)
      values ('alert', 'Expired', 'expired', now() - interval '1 minute')`), { code: "23514" });
    assert.equal((await engine.query("update public.notifications set read_at = now() returning id")).rows.length, 1);
    await assert.rejects(engine.query("update public.notifications set title = 'Rewritten'"), { code: "42501" });
    await assert.rejects(engine.query("update public.notifications set link = '/profile'"), { code: "42501" });

    await engine.exec(`set request.jwt.claim.sub = '${other}'`);
    for (const table of ["notifications", "notification_preferences"]) {
      assert.equal((await engine.query(`select * from public.${table}`)).rows.length, 0);
      assert.equal((await engine.query(`delete from public.${table} returning user_id`)).rows.length, 0);
    }
    assert.equal((await engine.query("update public.notifications set read_at = now() returning id")).rows.length, 0);
    assert.equal((await engine.query("update public.notification_preferences set bus_lead_minutes = 1 returning user_id")).rows.length, 0);
    // The same run key belongs independently to each account.
    await engine.query(insert);

    await engine.exec("reset role; set role anon");
    for (const table of ["notifications", "notification_preferences"]) {
      await assert.rejects(engine.query(`select * from public.${table}`), { code: "42501" });
    }
    await engine.exec(`reset role; set role authenticated; set request.jwt.claim.sub = '${owner}'`);
    assert.equal((await engine.query("delete from public.notifications returning id")).rows.length, 1);
    assert.equal((await engine.query("delete from public.notification_preferences returning user_id")).rows.length, 1);
  } finally {
    await engine.close();
  }
});
