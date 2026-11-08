import * as webpush from "web-push";
import { admit, databaseClient, networkKey } from "../_shared/admission.ts";
import { cors, guard } from "../_shared/http.ts";
import { pushRemindersDue, validPushState, validSubscription } from "./core.js";

const digest = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, "0")).join("");
const publicKey = Deno.env.get("PUSH_VAPID_PUBLIC_KEY");
const privateKey = Deno.env.get("PUSH_VAPID_PRIVATE_KEY");
const subject = Deno.env.get("PUSH_VAPID_SUBJECT");

Deno.serve(async (request: Request) => {
  const early = guard(request, ["GET", "POST"], 65536); if (early) return early;
  const headers = cors(request), db = databaseClient("archride-push-reminders");
  let release = async () => {};
  let transaction = false;
  try {
    const jobToken = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{32,256})$/)?.[1];
    const expected = Deno.env.get("PUSH_JOB_TOKEN");
    const isJob = !!jobToken && !!expected && (await digest(jobToken)) === (await digest(expected));
    if (!isJob) {
      const admission = await admit(request, "read", db, true); release = admission.release;
      if (admission.response) return admission.response;
      if (request.method === "GET") {
        if (!publicKey || !privateKey || !subject || !expected) return Response.json({ error: "push_not_configured" }, { status: 503, headers });
        return Response.json({ publicKey }, { headers });
      }
      const raw = await request.text();
      if (raw.length > 65536) return Response.json({ error: "request_too_large" }, { status: 413, headers });
      let body; try { body = JSON.parse(raw); } catch { return Response.json({ error: "invalid_request" }, { status: 400, headers }); }
      if (!body || !/^[a-f0-9]{64}$/.test(body.token)) return Response.json({ error: "invalid_token" }, { status: 400, headers });
      const hash = await digest(body.token);
      if (body.action === "disable") {
        await db.query("delete from archride_private.push_devices where token_hash=$1", [hash]);
        return Response.json({ disabled: true }, { headers });
      }
      if (!publicKey || !privateKey || !subject || !expected) return Response.json({ error: "push_not_configured" }, { status: 503, headers });
      if (body.action !== "sync" || !validSubscription(body.subscription) || !validPushState(body.state)) return Response.json({ error: "invalid_reminders" }, { status: 400, headers });
      await db.query("begin"); transaction = true;
      await db.query("select pg_advisory_xact_lock(hashtext('archride-push-enroll'))");
      const exists = (await db.query("select 1 from archride_private.push_devices where token_hash=$1", [hash])).rows.length;
      if (!exists) {
        const quota = await db.query(`insert into archride_private.request_limits(scope,key_hash,window_start,hits,expires_at)
          values('push-enroll',$1,date_trunc('hour',now()),1,date_trunc('hour',now())+interval '2 hours')
          on conflict(scope,key_hash) do update set
          hits=case when request_limits.window_start=excluded.window_start then request_limits.hits+1 else 1 end,
          window_start=excluded.window_start, expires_at=excluded.expires_at returning hits`, [await networkKey(request)]);
        const count = Number((await db.query("select count(*) from archride_private.push_devices")).rows[0].count);
        if (quota.rows[0].hits > 30 || count >= 1000) {
          await db.query("commit"); transaction = false;
          return Response.json({ error: "rate_limited" }, { status: 429, headers: { ...headers, "retry-after": "60" } });
        }
      }
      // Endpoint uniqueness prevents somebody who learns an endpoint from replacing its owner.
      await db.query(`insert into archride_private.push_devices(token_hash,endpoint_hash,subscription,state)
        values($1,$2,$3::jsonb,$4::jsonb) on conflict(token_hash) do update set
        endpoint_hash=excluded.endpoint_hash, subscription=excluded.subscription, state=excluded.state,
        updated_at=now(), expires_at=now()+interval '8 days'`, [hash, await digest(body.subscription.endpoint), JSON.stringify(body.subscription), JSON.stringify(body.state)]);
      await db.query("commit"); transaction = false;
      return Response.json({ syncedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 8 * 86400000).toISOString() }, { headers });
    }
    if (request.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405, headers });
    if (!publicKey || !privateKey || !subject) return Response.json({ error: "push_not_configured" }, { status: 503, headers });
    await db.connect();
    const locked = await db.query("select pg_try_advisory_lock(hashtext('archride-push-dispatch')) as acquired");
    if (!locked.rows[0]?.acquired) return Response.json({ skipped: "already_running" }, { headers });
    await db.query("delete from archride_private.push_devices where expires_at <= now()");
    const devices = await db.query("select token_hash from archride_private.push_devices where checked_at < now()-interval '45 seconds' order by checked_at limit 100");
    let sent = 0, checked = 0;
    const startedAt = Date.now();
    for (const device of devices.rows) {
      // ponytail: one bounded dispatcher; increase throughput before exceeding 100 active devices/minute.
      if (Date.now() - startedAt > 45000) break;
      await db.query("begin"); transaction = true;
      // Sync and disable serialize with dispatch, so a stale snapshot cannot undo a change.
      const row = (await db.query("select * from archride_private.push_devices where token_hash=$1 for update", [device.token_hash])).rows[0];
      if (!row) { await db.query("commit"); transaction = false; continue; }
      checked++;
      const ids = row.state.watched.map((watch: { arrivalId: string }) => watch.arrivalId);
      const arrivals = ids.length ? (await db.query("select * from public.transit_arrivals where id=any($1::text[])", [ids])).rows : [];
      const feed = (await db.query("select * from public.feed_status where id='uga-passio:arrivals'")).rows[0] ?? null;
      const handled = Object.fromEntries(Object.entries(row.handled).filter(([, expiry]) => Number(expiry) > Date.now()));
      let gone = false;
      for (const draft of pushRemindersDue(row.state, arrivals, feed, handled, Date.now())) {
        try {
          const scheduled = row.state.scheduled.find((job: { notification: { dedupeKey: string } }) => job.notification.dedupeKey === draft.dedupeKey);
          const deliverBy = Math.min(Date.parse(draft.expiresAt), Date.now() + 60000, scheduled ? scheduled.dueAt + 90000 : Infinity);
          await webpush.sendNotification(row.subscription, JSON.stringify({ ...draft, deliverBy }), {
            vapidDetails: { subject, publicKey, privateKey }, TTL: 60, urgency: "high", timeout: 5000,
          });
          handled[draft.dedupeKey] = Date.parse(draft.expiresAt); sent++;
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await db.query("delete from archride_private.push_devices where token_hash=$1", [device.token_hash]);
            gone = true; break;
          }
          // Transient failures are retried only while the reminder is still timely.
        }
      }
      if (!gone) await db.query("update archride_private.push_devices set handled=$2::jsonb, checked_at=now() where token_hash=$1", [device.token_hash, JSON.stringify(handled)]);
      await db.query("commit"); transaction = false;
    }
    return Response.json({ checked, sent }, { headers });
  } catch {
    if (transaction) await db.query("rollback").catch(() => {});
    return Response.json({ error: "push_unavailable" }, { status: 503, headers });
  } finally { await release(); await db.end().catch(() => {}); }
});
