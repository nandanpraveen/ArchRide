import { test } from "node:test";
import assert from "node:assert/strict";
import { runIngestion } from "../../scripts/transit/run";
import { POLL_SECONDS, retryDelayMs } from "../../scripts/transit/cadence";
import { localDatabase } from "../../scripts/transit/local-db";
import { saveStatic } from "../../scripts/transit/store";
import { staticCatalog, endpoints } from "../../scripts/transit/model";
import { archive, message } from "./fixtures";
import { fetchFeed } from "../../scripts/transit/fetch";

test("confirmed policy and bounded backoff never shorten provider cooldown", async () => {
  assert.deepEqual(POLL_SECONDS, { vehicles: 10, arrivals: 30, alerts: 120 });
  assert.equal(retryDelayMs("vehicles", 0, null, 0), 10000);
  assert.equal(retryDelayMs("vehicles", 2, null, 0), 40000);
  assert.equal(retryDelayMs("alerts", 10, null, 0), 300000);
  assert.equal(
    retryDelayMs("vehicles", 0, new Date(600000).toISOString(), 0),
    600000,
  );
  let calls = 0;
  await assert.rejects(
    fetchFeed("https://test.invalid", {
      attempts: 1,
      fetch: async () => {
        calls++;
        return new Response("", { status: 500 });
      },
    }),
    /upstream_5xx/,
  );
  assert.equal(calls, 1);
});

test("scheduled worker independently gates feeds, and persists failure cooldown", async () => {
  const { db, engine } = await localDatabase();
  const previous = globalThis.fetch;
  const calls: string[] = [];
  try {
    await saveStatic(db, staticCatalog(archive()));
    await db.query(
      "update public.transit_sources set enabled=true where id='uga-passio'",
    );
    // Empty valid full snapshots allow testing scheduler behavior without fabricating buses.
    globalThis.fetch = async (input) => {
      calls.push(String(input));
      return new Response(
        Uint8Array.from(message([], Math.floor(Date.now() / 1000))).buffer,
      );
    };
    await runIngestion(db, "scheduled");
    assert.deepEqual(
      [...calls],
      [endpoints.vehicles, endpoints.arrivals, endpoints.alerts],
    );
    calls.length = 0;
    await runIngestion(db, "all");
    assert.equal(calls.length, 0);
    await db.query(
      "update archride_private.transit_poll_state set last_started_at=now()-interval '11 seconds' where feed_id='uga-passio:vehicles'",
    );
    await runIngestion(db, "scheduled");
    assert.deepEqual([...calls], [endpoints.vehicles]);
    calls.length = 0;
    await db.query(
      "update archride_private.transit_poll_state set last_started_at=now()-interval '31 seconds' where feed_id='uga-passio:arrivals'",
    );
    globalThis.fetch = async (input) => {
      calls.push(String(input));
      return new Response("", {
        status: 429,
        headers: { "retry-after": "600" },
      });
    };
    await runIngestion(db, "scheduled");
    assert.deepEqual([...calls], [endpoints.arrivals]);
    calls.length = 0;
    const state = (
      await db.query(
        "select failures from archride_private.transit_poll_state where feed_id='uga-passio:arrivals'",
      )
    ).rows[0];
    assert.equal(state.failures, 1);
    await db.query(
      "update archride_private.transit_poll_state set last_started_at=now()-interval '1 hour' where feed_id='uga-passio:arrivals'",
    );
    await runIngestion(db, "scheduled");
    assert.equal(calls.length, 0);
    const cooldown = (
      await db.query(
        "select next_attempt_at from public.feed_status where id='uga-passio:arrivals'",
      )
    ).rows[0].next_attempt_at;
    assert(new Date(String(cooldown)).getTime() > Date.now() + 590000);
  } finally {
    globalThis.fetch = previous;
    await engine.close();
  }
});

test("freshness follows each feed cadence and valid partial predictions retain independent clocks", async () => {
  const { feedFreshness, vehicleFreshness, arrivalFeedConnected } =
    await import("../../src/lib/transit/contracts");
  const { arrivalEstimate } = await import("../../src/lib/transit/estimates");
  const now = Date.parse("2026-10-25T12:00:00Z");
  const feed = (id: string, age: number) =>
    ({
      id,
      state: "healthy",
      last_success_at: new Date(now).toISOString(),
      source_timestamp: new Date(now - age * 1000).toISOString(),
    }) as import("../../src/lib/transit/contracts").FeedHealth;
  assert.equal(feedFreshness(feed("uga-passio:vehicles", 31), now), "stale");
  assert.equal(feedFreshness(feed("uga-passio:arrivals", 89), now), "current");
  assert.equal(feedFreshness(feed("uga-passio:arrivals", 91), now), "stale");
  assert.equal(feedFreshness(feed("uga-passio:alerts", 359), now), "current");
  assert.equal(feedFreshness(feed("uga-passio:alerts", 361), now), "stale");
  assert.equal(
    vehicleFreshness(
      {
        position_timestamp: new Date(now - 31000).toISOString(),
      } as import("../../src/lib/transit/contracts").Vehicle,
      now,
    ),
    "stale",
  );
  const partial = {
    ...feed("uga-passio:arrivals", 500),
    state: "stale",
    error_code: "partial_rejection",
    last_attempt_at: new Date(now).toISOString(),
  };
  assert(arrivalFeedConnected(partial, now));
  const row = {
    provenance: "source",
    relationship: "SCHEDULED",
    arrival_at: new Date(now + 600000).toISOString(),
    valid_until: new Date(now + 900000).toISOString(),
    update_timestamp: new Date(now - 91000).toISOString(),
  } as import("../../src/lib/transit/contracts").Arrival;
  assert.equal(arrivalEstimate(row, now, true).countdownMinutes, null);
});

test("targeted context preserves loop occurrences and empty trip selection never loads the full catalog", async () => {
  const { loadContext } = await import("../../scripts/transit/store");
  const { normalize } = await import("../../scripts/transit/model");
  const { update, NOW } = await import("./fixtures");
  const { db, engine } = await localDatabase();
  try {
    await saveStatic(db, staticCatalog(archive()));
    const selected = await loadContext(db, ["uga-passio:t"]);
    assert.equal(selected.trips.size, 1);
    assert.equal(selected.occurrences.size, 3);
    assert.equal(
      normalize("arrivals", message([update()]), selected, NOW).rows.length,
      2,
    );
    const empty = await loadContext(db, []);
    assert.equal(empty.trips.size, 0);
    assert.equal(empty.occurrences.size, 0);
    for (const role of ["anon", "authenticated"]) {
      await db.query("set role "+role);
      await assert.rejects(db.query("select * from archride_private.transit_poll_state"),/permission denied/);
      await db.query("reset role");
    }
    assert.throws(
      () => normalize("arrivals", message([update()]), empty, NOW),
      /all_entities_rejected/,
    );
  } finally {
    await engine.close();
  }
});
