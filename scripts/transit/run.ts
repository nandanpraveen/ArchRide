import { POLL_SECONDS, retryDelayMs } from "./cadence";
import {
  endpoints,
  decode,
  id,
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
export type RunMode = "all" | "static" | "scheduled";
export async function runIngestion(
  db: DB,
  mode: RunMode = "all",
  verifyReplay = false,
) {
  let failed = false;
  let replayed = 0;
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
      for (const feed of ["vehicles", "arrivals", "alerts"] as Exclude<
        Feed,
        "static"
      >[]) {
        // Request spacing survives worker restarts and applies to manual runs too.
        const feedId = "uga-passio:" + feed;
        const timing = (
          await db.query<{ wait_ms: number }>(
            `select greatest(0,extract(epoch from (greatest(p.last_started_at + make_interval(secs => $2::int), coalesce(f.next_attempt_at,'-infinity'::timestamptz))-clock_timestamp()))*1000)::float8 as wait_ms
           from archride_private.transit_poll_state p join public.feed_status f on f.id=p.feed_id where p.feed_id=$1`,
            [feedId, POLL_SECONDS[feed]],
          )
        ).rows[0];
        // Absorb subsecond cron jitter without issuing a request before its allowed time.
        if (timing && timing.wait_ms > 0 && timing.wait_ms <= 1000)
          await new Promise((resolve) =>
            setTimeout(resolve, Math.ceil(timing.wait_ms) + 5),
          );
        const reserved = (
          await db.query<{ failures: number; last_started_at: string }>(
            `update archride_private.transit_poll_state p set last_started_at=clock_timestamp()
           from public.feed_status f where p.feed_id=$1 and f.id=p.feed_id
           and p.last_started_at <= clock_timestamp()-make_interval(secs => $2::int)
           and (f.next_attempt_at is null or f.next_attempt_at <= clock_timestamp()) returning p.failures,p.last_started_at`,
            [feedId, POLL_SECONDS[feed]],
          )
        ).rows[0];
        if (!reserved) {
          console.log(JSON.stringify({ feed, outcome: "not_due_or_cooldown" }));
          continue;
        }
        try {
          const bytes = await fetchFeed(endpoints[feed], { attempts: 1 });
          // Load only referenced trip patterns, not the entire stop-time catalog every 10s.
          const tripIds = [
            ...new Set(
              decode(bytes).entity.flatMap((entity) => {
                if (feed === "vehicles")
                  return entity.vehicle?.trip?.tripId
                    ? [id(entity.vehicle.trip.tripId)]
                    : [];
                if (feed === "arrivals")
                  return entity.tripUpdate?.trip?.tripId
                    ? [id(entity.tripUpdate.trip.tripId)]
                    : [];
                return (entity.alert?.informedEntity ?? []).flatMap(
                  (selector) =>
                    selector.trip?.tripId ? [id(selector.trip.tripId)] : [],
                );
              }),
            ),
          ];
          const c = await loadContext(db, tripIds);
          const result = normalize(feed, bytes, c);
          const saved = await saveRealtime(db, feed, result);
          await db.query(
            "update archride_private.transit_poll_state set failures=0 where feed_id=$1",
            [feedId],
          );
          if (verifyReplay) {
            replayed++;
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
              requestStartedAt: reserved.last_started_at,
              rejected: result.rejected,
              rejectionReasons: result.rejectionReasons,
              sourceTimestamp: result.timestamp,
            }),
          );
        } catch (e) {
          failed = true;
          const code =
            e instanceof FeedError ? e.code : "decode_or_store_failed";
          const retryAt = new Date(
            Date.now() +
              retryDelayMs(
                feed,
                reserved.failures,
                e instanceof FeedError ? e.retryAfterAt : null,
              ),
          ).toISOString();
          await db.query(
            "update archride_private.transit_poll_state set failures=least(failures+1,10) where feed_id=$1",
            [feedId],
          );
          await health(db, feed, null, 0, code, new Date(), retryAt);
          console.error(JSON.stringify({ feed, outcome: "failed", code }));
        }
      }
    }
  } finally {
    try {
      if (mode !== "scheduled") await cleanup(db);
    } finally {
      await db.query("select pg_advisory_unlock(71481921)");
    }
  }
  return {
    outcome: failed ? "partial_failure" : "success",
    failed,
    replayVerified: verifyReplay && replayed > 0 && !failed,
  };
}
