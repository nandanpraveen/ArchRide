import pg from "pg";
import {
  endpoints,
  staticCatalog,
  normalize,
  FeedError,
  assert,
  type Feed,
} from "./model";
import { fetchFeed } from "./fetch";
import {
  health,
  saveStatic,
  saveRealtime,
  loadContext,
  cleanup,
} from "./store";

async function main() {
  // This is a server-only CLI. No job route or privileged credential enters the Next.js bundle.
  assert(
    process.env.TRANSIT_SOURCE_APPROVED === "true",
    "source_approval_required",
  );
  assert(process.env.TRANSIT_DATABASE_URL, "database_url_required");
  // Session-capable direct connection or Supavisor SESSION mode, never transaction pooling.
  const db = new pg.Client({
    connectionString: process.env.TRANSIT_DATABASE_URL,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 60_000,
    application_name: "archride-transit",
  });
  await db.connect();
  let locked = false,
    failed = false;
  try {
    locked = (await db.query("select pg_try_advisory_lock(71481921) as locked"))
      .rows[0].locked;
    if (!locked) {
      console.log(JSON.stringify({ outcome: "overlap_skipped" }));
      return;
    }
    const enabled = (
      await db.query(
        "select enabled from public.transit_sources where id='uga-passio'",
      )
    ).rows[0]?.enabled;
    assert(enabled, "source_disabled");
    const staticHealth = (
      await db.query(
        "select last_success_at,next_attempt_at from public.feed_status where id='uga-passio:static'",
      )
    ).rows[0];
    const staticDue =
      !staticHealth?.last_success_at ||
      Date.now() - new Date(staticHealth.last_success_at).getTime() >=
        86_400_000;
    if (
      staticDue &&
      (!staticHealth?.next_attempt_at ||
        new Date(staticHealth.next_attempt_at).getTime() <= Date.now())
    ) {
      try {
        const c = staticCatalog(await fetchFeed(endpoints.static));
        await saveStatic(db, c);
        console.log(JSON.stringify({ feed: "static", outcome: "success" }));
      } catch (e) {
        failed = true;
        const code = e instanceof FeedError ? e.code : "static_import_failed";
        await health(
          db,
          "static",
          null,
          0,
          code,
          new Date(),
          e instanceof FeedError ? e.retryAfterAt : null,
        );
        console.error(
          JSON.stringify({ feed: "static", outcome: "failed", code }),
        );
      }
    }
    const c = await loadContext(db);
    for (const feed of ["vehicles", "arrivals", "alerts"] as Exclude<
      Feed,
      "static"
    >[]) {
      const cooldown = (
        await db.query(
          "select next_attempt_at from public.feed_status where id=$1",
          ["uga-passio:" + feed],
        )
      ).rows[0]?.next_attempt_at;
      if (cooldown && new Date(cooldown).getTime() > Date.now()) {
        failed = true;
        console.log(JSON.stringify({ feed, outcome: "provider_cooldown" }));
        continue;
      }
      try {
        const result = normalize(feed, await fetchFeed(endpoints[feed]), c);
        const saved = await saveRealtime(db, feed, result);
        if (saved.outcome !== "success") failed = true;
        console.log(
          JSON.stringify({
            feed,
            ...saved,
            rejected: result.rejected,
            sourceTimestamp: result.timestamp,
          }),
        );
      } catch (e) {
        failed = true;
        const code = e instanceof FeedError ? e.code : "decode_or_store_failed";
        await health(
          db,
          feed,
          null,
          0,
          code,
          new Date(),
          e instanceof FeedError ? e.retryAfterAt : null,
        );
        console.error(JSON.stringify({ feed, outcome: "failed", code }));
      }
    }
    await cleanup(db);
  } finally {
    try {
      if (locked) await db.query("select pg_advisory_unlock(71481921)");
    } finally {
      await db.end();
    }
  }
  if (failed) process.exitCode = 1;
}
main().catch((e) => {
  console.error(
    JSON.stringify({
      outcome: "failed",
      code: e instanceof FeedError ? e.code : "worker_failed",
    }),
  );
  process.exitCode = 1;
});
