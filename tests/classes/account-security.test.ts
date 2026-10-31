import assert from "node:assert/strict";
import test from "node:test";
import { localDatabase } from "../../scripts/transit/local-db";

test("class schedules restrict account CRUD and ownership changes in PostgreSQL", async () => {
  const { engine } = await localDatabase();
  const owner = "00000000-0000-0000-0000-0000000000a1";
  const other = "00000000-0000-0000-0000-0000000000b2";
  try {
    await engine.exec(`insert into auth.users(id) values ('${owner}'), ('${other}');
      set role authenticated; set request.jwt.claim.sub = '${owner}';`);
    const inserted = await engine.query<{ id: string; user_id: string }>(`
      insert into public.classes(title, building_id, weekdays, starts_at)
      values ('Calculus', 'building', '{1,4}', '09:30') returning id, user_id`);
    assert.equal(inserted.rows[0].user_id, owner);
    await assert.rejects(engine.query(`update public.classes set user_id = '${other}'`), /row-level security/);
    await assert.rejects(engine.query(`insert into public.classes(user_id, title, building_id, weekdays, starts_at)
      values ('${other}', 'Spoof', 'building', '{1}', '09:30')`), /row-level security/);
    for (const [days, time] of [["{0}", "09:30"], ["{1}", "25:61"]]) {
      await assert.rejects(engine.query(`insert into public.classes(title, building_id, weekdays, starts_at)
        values ('Invalid', 'building', $1::smallint[], $2)`, [days, time]), /check constraint/);
    }
    await engine.exec(`set request.jwt.claim.sub = '${other}'`);
    assert.equal((await engine.query("select * from public.classes")).rows.length, 0);
    assert.equal((await engine.query("update public.classes set title = 'Hijacked' returning id")).rows.length, 0);
    assert.equal((await engine.query("delete from public.classes returning id")).rows.length, 0);
    await engine.exec("reset role; set role anon");
    await assert.rejects(engine.query("select * from public.classes"), /permission denied/);
    await engine.exec(`reset role; set role authenticated; set request.jwt.claim.sub = '${owner}'`);
    assert.equal((await engine.query<{ title: string }>("update public.classes set title = 'Calculus II' returning title")).rows[0].title, "Calculus II");
    assert.equal((await engine.query("delete from public.classes returning id")).rows.length, 1);
  } finally {
    await engine.close();
  }
});
