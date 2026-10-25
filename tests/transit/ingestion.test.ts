import { test } from "node:test";
import assert from "node:assert/strict";
import {
  staticCatalog,
  context,
  normalize,
  seconds,
  FeedError,
} from "../../scripts/transit/model";
import { fetchFeed } from "../../scripts/transit/fetch";
import { localDatabase } from "../../scripts/transit/local-db";
import {
  saveStatic,
  saveRealtime,
  health,
  cleanup,
  type DB,
} from "../../scripts/transit/store";
import {
  archive,
  message,
  vehicle,
  update,
  epoch,
  NOW,
  trip,
} from "./fixtures";
import { freshness, usableArrival } from "../../src/lib/transit/contracts";
import type { Tables } from "../../src/lib/supabase/database.types";
const catalog = () => staticCatalog(archive());
const ctx = () => context(catalog());
const now = new Date(NOW);
async function count(db: DB, table: string) {
  return Number(
    (await db.query(`select count(*) n from public.${table}`)).rows[0].n,
  );
}

test("static preserves repeated stops, zero coordinates, frequencies and >24h service times", () => {
  const c = catalog();
  assert.equal(c.transit_stop_times.length, 3);
  assert.equal(c.transit_stops[0].latitude, 0);
  assert.equal(c.transit_stop_times[2].arrival_seconds, 90060);
  assert.equal(c.transit_frequencies[0].exact_times, false);
  assert.equal(seconds(""), null);
  assert.throws(() => seconds("25:60:00"));
});
test("static accepts omitted optional numeric columns while requiring stop sequences", () => {
  const c = staticCatalog(
    archive({
      "stops.txt":
        "stop_id,stop_name,stop_lat,stop_lon\na,Test East,0,0\nb,Test West,33.95,-83.37\n",
      "trips.txt": "route_id,service_id,trip_id\nr,s,t\n",
      "stop_times.txt":
        "trip_id,arrival_time,departure_time,stop_id,stop_sequence\nt,24:01:00,24:01:00,a,1\nt,,,b,2\n",
    }),
  );
  assert.equal(c.transit_stops[0].location_type, 0);
  assert.equal(c.transit_trips[0].direction_id, null);
  assert.equal(c.transit_stop_times[0].pickup_type, null);
  assert.equal(c.transit_stop_times[0].drop_off_type, null);
  assert.throws(
    () =>
      staticCatalog(
        archive({
          "stop_times.txt":
            "trip_id,arrival_time,departure_time,stop_id\nt,24:01:00,24:01:00,a\n",
        }),
      ),
    /invalid_integer/,
  );
});
test("invalid static foreign references, coordinates, duplicate occurrences and timezone fail atomically", () => {
  for (const overrides of [
    { "stops.txt": "stop_id,stop_name,stop_lat,stop_lon\na,A,91,0\n" },
    { "agency.txt": "agency_id,agency_timezone\n1,Europe/London\n" },
    {
      "trips.txt":
        "route_id,service_id,trip_id,trip_headsign,direction_id,shape_id\nunknown,s,t,Loop,0,\n",
    },
    {
      "stop_times.txt":
        "trip_id,arrival_time,departure_time,stop_id,stop_sequence,pickup_type,drop_off_type\nt,,,a,1,0,0\nt,,,b,1,0,0\n",
    },
  ] as Record<string, string>[])
    assert.throws(() => staticCatalog(archive(overrides)), FeedError);
});
test("protobuf: preserve distinct loop stop arrivals and frequency trip instances", () => {
  const result = normalize(
    "arrivals",
    message([
      update(),
      {
        ...update(),
        id: "u2",
        tripUpdate: {
          ...update().tripUpdate,
          trip: { ...trip, startTime: "25:00:00" },
        },
      },
    ]),
    ctx(),
    NOW,
  );
  assert.equal(result.rows.length, 4);
  assert.equal(new Set(result.rows.map((r) => r.id)).size, 4);
});
test("malformed feeds and unsupported differentials fail; future timestamps rejected", () => {
  assert.throws(() =>
    normalize("vehicles", new TextEncoder().encode("bad JSON"), ctx(), NOW),
  );
  assert.throws(
    () => normalize("vehicles", message([], epoch, 1), ctx(), NOW),
    /differential/,
  );
  assert.throws(
    () => normalize("vehicles", message([], epoch + 1000), ctx(), NOW),
    /timestamp/,
  );
});
test("partial feed preserves valid vehicles, rejects foreign IDs, invalid coords and stop mismatches", () => {
  const entities = [
    vehicle(),
    {
      ...vehicle(),
      id: "bad1",
      vehicle: {
        ...vehicle().vehicle,
        vehicle: { id: "x" },
        position: { latitude: 100, longitude: 0 },
      },
    },
    {
      ...vehicle(),
      id: "bad2",
      vehicle: { ...vehicle().vehicle, trip: { ...trip, routeId: "other" } },
    },
    {
      ...vehicle(),
      id: "bad3",
      vehicle: { ...vehicle().vehicle, stopId: "unknown" },
    },
  ];
  const r = normalize("vehicles", message(entities), ctx(), NOW);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rejected, 3);
  assert.equal(r.events.length, 1);
  assert.throws(
    () => normalize("vehicles", message(entities.slice(1)), ctx(), NOW),
    /all_entities/,
  );
});
test("source cancellation without stop updates invalidates every trip occurrence, absence is not cancellation", () => {
  const r = normalize(
    "arrivals",
    message([
      update(epoch, {
        trip: { ...trip, scheduleRelationship: 3 },
        stopTimeUpdate: [],
      }),
    ]),
    ctx(),
    NOW,
  );
  assert.equal(r.rows.length, 3);
  assert(
    r.rows.every((r) => r.relationship === "CANCELED" && r.arrival_at === null),
  );
  assert.equal(normalize("vehicles", message([]), ctx(), NOW).rows.length, 0);
});
test("delay-only, skipped, no-data, ambiguous occurrence and missing trip start never yield guessed ETAs", () => {
  for (const relation of [0, 1, 2]) {
    const r = normalize(
      "arrivals",
      message([
        update(epoch, {
          stopTimeUpdate: [
            {
              stopId: "a",
              stopSequence: 1,
              scheduleRelationship: relation,
              arrival: { delay: 120 },
            },
          ],
        }),
      ]),
      ctx(),
      NOW,
    );
    assert.equal(r.rows[0].arrival_at, null);
  }
  assert.throws(
    () =>
      normalize(
        "arrivals",
        message([
          update(epoch, {
            stopTimeUpdate: [{ stopId: "a", arrival: { time: epoch + 100 } }],
          }),
        ]),
        ctx(),
        NOW,
      ),
    /all_entities/,
  );
  assert.throws(
    () =>
      normalize(
        "arrivals",
        message([update(epoch, { trip: { tripId: "t" } })]),
        ctx(),
        NOW,
      ),
    /all_entities/,
  );
});
test("source clock controls freshness, not repeated fetch time", () => {
  assert.equal(
    freshness(new Date(NOW - 181000).toISOString(), 180, NOW),
    "stale",
  );
  const a = normalize("arrivals", message([update()]), ctx(), NOW)
    .rows[0] as Tables<"transit_arrivals">;
  assert(usableArrival(a, NOW));
  assert(!usableArrival({ ...a, relationship: "CANCELED" }, NOW));
  assert(!usableArrival(a, NOW + 181000));
});
test("bounded retries: 429 honors Retry-After; 500/timeout recovery; long cooldown never shortened; bodies bounded", async () => {
  let calls = 0;
  const waits: number[] = [];
  const result = await fetchFeed("https://example.test", {
    fetch: async () => {
      calls++;
      return calls < 3
        ? new Response("", {
            status: calls === 1 ? 429 : 500,
            headers: { "Retry-After": "1" },
          })
        : new Response("ok");
    },
    sleep: async (ms) => {
      waits.push(ms);
    },
  });
  assert.equal(new TextDecoder().decode(result), "ok");
  assert.equal(calls, 3);
  assert.deepEqual(waits, [1000, 1000]);
  await assert.rejects(
    fetchFeed("https://example.test", {
      fetch: async () =>
        new Response("", { status: 429, headers: { "Retry-After": "120" } }),
      sleep: async () => assert.fail("must not shorten cooldown"),
    }),
    /rate_limited/,
  );
  await assert.rejects(
    fetchFeed("https://example.test", {
      fetch: async () => {
        throw new Error("timeout");
      },
      sleep: async () => {},
    }),
    /network_or_timeout/,
  );
  await assert.rejects(
    fetchFeed("https://example.test", {
      fetch: async () => new Response("too large"),
      maxBytes: 2,
    }),
    /response_too_large/,
  );
});
test("database integration: real migrations, replay, out-of-order, partial failure, absence and recovery", async () => {
  const { db, engine } = await localDatabase();
  try {
    const c = catalog();
    await saveStatic(db, c, now);
    await saveStatic(db, c, now);
    assert.equal(await count(db, "transit_stop_times"), 3);
    const v = normalize("vehicles", message([vehicle()]), ctx(), NOW);
    await saveRealtime(db, "vehicles", v, now);
    await saveRealtime(db, "vehicles", v, now);
    assert.equal(await count(db, "transit_vehicles"), 1);
    assert.equal(await count(db, "transit_observations"), 1);
    assert.equal(await count(db, "transit_arrival_events"), 1);
    const old = normalize(
      "vehicles",
      message([vehicle(epoch - 60)], epoch - 60),
      ctx(),
      NOW,
    );
    assert.equal(
      (await saveRealtime(db, "vehicles", old, now)).outcome,
      "out_of_order",
    );
    assert.equal(
      new Date(
        String(
          (
            await db.query(
              "select position_timestamp from public.transit_vehicles",
            )
          ).rows[0].position_timestamp,
        ),
      ).toISOString(),
      v.rows[0].position_timestamp,
    );
    const a = normalize("arrivals", message([update()]), ctx(), NOW);
    await saveRealtime(db, "arrivals", a, now);
    await saveRealtime(db, "arrivals", a, now);
    assert.equal(await count(db, "transit_arrivals"), 2);
    await health(db, "vehicles", null, 0, "network_or_timeout", now);
    assert.equal(await count(db, "transit_vehicles"), 1);
    assert.equal(
      (
        await db.query(
          "select state from public.feed_status where id='uga-passio:vehicles'",
        )
      ).rows[0].state,
      "stale",
    );
    await saveRealtime(
      db,
      "vehicles",
      normalize("vehicles", message([], epoch + 1), ctx(), NOW + 1000),
      new Date(NOW + 1000),
    );
    assert.equal(await count(db, "transit_vehicles"), 1);
    await saveRealtime(
      db,
      "arrivals",
      normalize("arrivals", message([], epoch + 1), ctx(), NOW + 1000),
      new Date(NOW + 1000),
    );
    assert(
      (
        await db.query("select relationship from public.transit_arrivals")
      ).rows.every((r) => r.relationship === "SCHEDULED"),
    );
    await saveRealtime(
      db,
      "vehicles",
      normalize(
        "vehicles",
        message([vehicle(epoch + 2)], epoch + 2),
        ctx(),
        NOW + 2000,
      ),
      new Date(NOW + 2000),
    );
    assert.equal(
      (
        await db.query(
          "select state from public.feed_status where id='uga-passio:vehicles'",
        )
      ).rows[0].state,
      "healthy",
    );
  } finally {
    await engine.close();
  }
});
test("database security: guests read public transit; anon/authenticated cannot mutate or read diagnostics/history", async () => {
  const { db, engine } = await localDatabase();
  try {
    await saveStatic(db, catalog(), now);
    for (const role of ["anon", "authenticated"]) {
      await db.query("set role " + role);
      assert.equal(await count(db, "transit_routes"), 1);
      for (const sql of [
        "insert into public.transit_routes(id) values('evil')",
        "update public.transit_stops set name='evil'",
        "delete from public.transit_stops",
        "select * from public.transit_observations",
        "select * from public.transit_job_runs",
        "select * from public.transit_retention",
      ])
        await assert.rejects(db.query(sql), /permission denied/);
      await db.query("reset role");
    }
    const tables = (
      await db.query<{ tablename: string; rowsecurity: boolean }>(
        "select tablename,rowsecurity from pg_tables where schemaname='public'",
      )
    ).rows;
    assert(tables.every((t) => t.rowsecurity));
  } finally {
    await engine.close();
  }
});
test("alerts: scoped selectors, agency-wide notice, empty snapshot deactivation, replay and partial rejection", async () => {
  const { db, engine } = await localDatabase();
  try {
    await saveStatic(db, catalog(), now);
    const entity = {
      id: "alert",
      alert: {
        headerText: { translation: [{ text: "Test notice" }] },
        informedEntity: [{ routeId: "r", stopId: "a" }],
      },
    };
    const r = normalize("alerts", message([entity]), ctx(), NOW);
    await saveRealtime(db, "alerts", r, now);
    await saveRealtime(db, "alerts", r, now);
    assert.equal(await count(db, "transit_alert_entities"), 1);
    await saveRealtime(
      db,
      "alerts",
      normalize("alerts", message([], epoch + 1), ctx(), NOW + 1000),
      now,
    );
    assert.equal(
      (await db.query("select active from public.transit_alerts")).rows[0]
        .active,
      false,
    );
  } finally {
    await engine.close();
  }
});
test("retention bounds history and predictions without deleting latest state", async () => {
  const { db, engine } = await localDatabase();
  try {
    await saveStatic(db, catalog(), now);
    await saveRealtime(
      db,
      "vehicles",
      normalize("vehicles", message([vehicle()]), ctx(), NOW),
      now,
    );
    // Source fixtures have a fixed date; retention compares receipt age with the database clock.
    await db.query("update public.transit_vehicles set received_at=now()");
    await db.query(
      "update public.transit_observations set received_at=now()-interval '8 days'",
    );
    await db.query(
      "update public.transit_arrival_events set received_at=now()-interval '100 days'",
    );
    await db.query(
      "update public.transit_job_runs set finished_at=now()-interval '31 days'",
    );
    await cleanup(db);
    assert.equal(await count(db, "transit_observations"), 0);
    assert.equal(await count(db, "transit_arrival_events"), 0);
    assert.equal(await count(db, "transit_job_runs"), 0);
    assert.equal(await count(db, "transit_vehicles"), 1);
  } finally {
    await engine.close();
  }
});

test("newer feed header cannot overwrite a newer individual vehicle or trip update", async () => {
  const { db, engine } = await localDatabase();
  try {
    await saveStatic(db, catalog(), now);
    await saveRealtime(
      db,
      "vehicles",
      normalize("vehicles", message([vehicle()]), ctx(), NOW),
      now,
    );
    await saveRealtime(
      db,
      "vehicles",
      normalize(
        "vehicles",
        message(
          [vehicle(epoch - 20, { position: { latitude: 1, longitude: 1 } })],
          epoch + 1,
        ),
        ctx(),
        NOW + 1000,
      ),
      now,
    );
    assert.equal(
      (await db.query("select latitude from public.transit_vehicles")).rows[0]
        .latitude,
      0,
    );
    await saveRealtime(
      db,
      "arrivals",
      normalize("arrivals", message([update()]), ctx(), NOW),
      now,
    );
    await saveRealtime(
      db,
      "arrivals",
      normalize(
        "arrivals",
        message(
          [
            update(epoch - 20, {
              stopTimeUpdate: [
                {
                  stopId: "a",
                  stopSequence: 1,
                  arrival: { time: epoch + 999 },
                },
              ],
            }),
          ],
          epoch + 1,
        ),
        ctx(),
        NOW + 1000,
      ),
      now,
    );
    const row = (
      await db.query(
        "select arrival_at from public.transit_arrivals where stop_sequence=1",
      )
    ).rows[0];
    assert.equal(
      new Date(String(row.arrival_at)).getTime(),
      (epoch + 300) * 1000,
    );
  } finally {
    await engine.close();
  }
});

test("partial alert snapshot retains last valid notices and persists provider cooldown", async () => {
  const { db, engine } = await localDatabase();
  try {
    await saveStatic(db, catalog(), now);
    const first = {
      id: "a1",
      alert: {
        headerText: { translation: [{ text: "Agency notice" }] },
        informedEntity: [{ agencyId: "1" }],
      },
    };
    await saveRealtime(
      db,
      "alerts",
      normalize("alerts", message([first]), ctx(), NOW),
      now,
    );
    const partial = normalize(
      "alerts",
      message(
        [
          { ...first, id: "a2" },
          { id: "bad", alert: { informedEntity: [{ stopId: "missing" }] } },
        ],
        epoch + 1,
      ),
      ctx(),
      NOW + 1000,
    );
    assert.equal(partial.rejected, 1);
    await saveRealtime(db, "alerts", partial, now);
    assert.equal(
      (
        await db.query("select active from public.transit_alerts where id=$1", [
          "uga-passio:a1",
        ])
      ).rows[0].active,
      true,
    );
    const retryAt = new Date(NOW + 120000).toISOString();
    await health(db, "alerts", null, 0, "rate_limited", now, retryAt);
    assert.equal(
      new Date(
        String(
          (
            await db.query(
              "select next_attempt_at from public.feed_status where id='uga-passio:alerts'",
            )
          ).rows[0].next_attempt_at,
        ),
      ).toISOString(),
      retryAt,
    );
  } finally {
    await engine.close();
  }
});

test("static write failure rolls back deactivation and deletion of the valid catalog", async () => {
  const { db, engine } = await localDatabase();
  try {
    await saveStatic(db, catalog(), now);
    const bad = catalog();
    bad.transit_stop_times[0].stop_id = "unknown";
    await assert.rejects(saveStatic(db, bad, now), /foreign key/);
    assert.equal(await count(db, "transit_stop_times"), 3);
    assert.equal(
      (await db.query("select active from public.transit_trips")).rows[0]
        .active,
      true,
    );
  } finally {
    await engine.close();
  }
});

test("continued stopped samples produce a single observed arrival, not an event per poll", async () => {
  const { db, engine } = await localDatabase();
  try {
    await saveStatic(db, catalog(), now);
    for (const offset of [0, 10, 20])
      await saveRealtime(
        db,
        "vehicles",
        normalize(
          "vehicles",
          message([vehicle(epoch + offset)], epoch + offset),
          ctx(),
          NOW + offset * 1000,
        ),
        now,
      );
    assert.equal(await count(db, "transit_observations"), 3);
    assert.equal(await count(db, "transit_arrival_events"), 1);
  } finally {
    await engine.close();
  }
});

test("omitted protobuf uncertainty/speed/bearing stay unknown and omitted stop sequence is only resolved when unambiguous", () => {
  const v = normalize(
    "vehicles",
    message([
      vehicle(epoch, {
        currentStopSequence: undefined,
        position: { latitude: 0, longitude: 0 },
      }),
    ]),
    ctx(),
    NOW,
  ).rows[0];
  assert.equal(v.speed, null);
  assert.equal(v.bearing, null);
  assert.equal(v.stop_sequence, null);
  const r = normalize(
    "arrivals",
    message([
      update(epoch, {
        stopTimeUpdate: [{ stopId: "b", arrival: { time: epoch + 100 } }],
      }),
    ]),
    ctx(),
    NOW,
  );
  assert.equal(r.rows[0].stop_sequence, 2);
  assert.equal(r.rows[0].uncertainty_seconds, null);
});

test("Passio vehicles sharing GTFS trip/date/start retain independent arrival identities", () => {
  const entities = ["bus-a", "bus-b"].map((vehicleId) => ({
    id: vehicleId,
    tripUpdate: { ...update().tripUpdate, vehicle: { id: vehicleId } },
  }));
  const r = normalize("arrivals", message(entities), ctx(), NOW);
  assert.equal(r.rows.length, 4);
  assert.equal(new Set(r.rows.map((row) => row.id)).size, 4);
  assert.equal(new Set(r.rows.map((row) => row.instance_key)).size, 2);
});
