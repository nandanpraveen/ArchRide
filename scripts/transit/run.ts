import {
  endpoints,
  staticCatalog,
  normalize,
  FeedError,
  assert,
  type Feed,
} from "./model";
import {
  health,
  saveStatic,
  saveRealtime,
  loadContext,
  cleanup,
  type DB,
} from "./store";
import { fetchFeed } from "./fetch";
export type RunMode = "all" | "static";
export async function runIngestion(
  db: DB,
  mode: RunMode = "all",
  verifyReplay = false,
) {
  let failed = false;
  const locked = (
    await db.query<{ locked: boolean }>(
      "select pg_try_advisory_lock(71481921) as locked",
    )
  ).rows[0].locked;
  if (!locked) return { outcome: "overlap_skipped", failed: false };
  try {
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
      Date.now() - new Date(String(staticHealth.last_success_at)).getTime() >=
        86_400_000;
    if (
      staticDue &&
      (!staticHealth?.next_attempt_at ||
        new Date(String(staticHealth.next_attempt_at)).getTime() <= Date.now())
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
    if (mode !== "static") {
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
        if (cooldown && new Date(String(cooldown)).getTime() > Date.now()) {
          failed = true;
          console.log(JSON.stringify({ feed, outcome: "provider_cooldown" }));
          continue;
        }
        try {
          const result = normalize(feed, await fetchFeed(endpoints[feed]), c);
          const saved = await saveRealtime(db, feed, result);
          if (verifyReplay) {
            const counts = async () =>
              (
                await db.query(
                  "select (select count(*) from public.transit_vehicles) as vehicles, (select count(*) from public.transit_observations) as observations, (select count(*) from public.transit_arrivals) as arrivals, (select count(*) from public.transit_arrival_events) as events",
                )
              ).rows[0];
            const before = JSON.stringify(await counts());
            await saveRealtime(db, feed, result);
            assert(
              JSON.stringify(await counts()) === before,
              "replay_changed_entity_counts",
            );
          }
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
          const code =
            e instanceof FeedError ? e.code : "decode_or_store_failed";
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
    }
  } finally {
    try {
      await cleanup(db);
    } finally {
      await db.query("select pg_advisory_unlock(71481921)");
    }
  }
  return {
    outcome: failed ? "partial_failure" : "success",
    failed,
    replayVerified: verifyReplay && !failed,
  };
}
