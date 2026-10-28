import { test } from "node:test";
import assert from "node:assert/strict";
import { arrivalEstimate, newerArrival } from "../../src/lib/transit/estimates";
import {
  assessDeadline,
  arriveBy,
  campusDeadline,
  type JourneyCandidate,
} from "../../src/lib/transit/deadlines";
import { evaluate, type Prediction } from "../../scripts/transit/evaluation";
import type { Arrival } from "../../src/lib/transit/contracts";
const now = Date.parse("2026-11-01T04:55:00Z");
const iso = (seconds: number) => new Date(now + seconds * 1000).toISOString();
const row = {
  id: "p",
  relationship: "SCHEDULED",
  provenance: "source",
  arrival_at: iso(120),
  received_at: iso(0),
  update_timestamp: iso(0),
  valid_until: iso(180),
} as Arrival;
test("clock expiry, negative times, backward updates, missing, cancellation and disconnect never become zero minutes", () => {
  assert.equal(arrivalEstimate(row, now).countdownMinutes, 2);
  for (const estimate of [
    arrivalEstimate(row, now + 181000),
    arrivalEstimate({ ...row, arrival_at: iso(-1) }, now),
    arrivalEstimate(null, now),
    arrivalEstimate({ ...row, relationship: "CANCELED" }, now),
    arrivalEstimate(row, now, false),
  ]) {
    assert.notEqual(estimate.state, "valid");
    assert.equal(estimate.countdownMinutes, null);
  }
  assert.equal(newerArrival(row, { ...row, update_timestamp: iso(-1) }), row);
});
const journey: JourneyCandidate = {
  id: "j",
  departureAt: iso(60),
  destinationArrivalAt: iso(600),
  walkingSeconds: 0,
  boardingBufferSeconds: 0,
  support: { kind: "schedule", serviceDate: "20261101", verified: true },
};
test("full destination arrival exact deadline, buffer, tight, late and invalid boundaries", () => {
  assert.equal(assessDeadline(journey, iso(600), 0, now).status, "on_time");
  assert.equal(assessDeadline(journey, iso(660), 60, now).status, "on_time");
  assert.equal(assessDeadline(journey, iso(659), 60, now).status, "tight");
  assert.equal(assessDeadline(journey, iso(599), 0, now).status, "likely_late");
  for (const deadline of [iso(-1), "invalid"])
    assert.equal(
      assessDeadline(journey, deadline, 0, now).status,
      "insufficient",
    );
  assert.equal(assessDeadline(null, iso(600), 0, now).status, "insufficient");
  assert.equal(
    assessDeadline(journey, iso(600), -1, now).status,
    "insufficient",
  );
});
test("future search requires supported service and never extrapolates live ETA", () => {
  const live: JourneyCandidate = {
    ...journey,
    departureAt: iso(3600),
    destinationArrivalAt: iso(4000),
    support: { kind: "live", estimate: arrivalEstimate(row, now) },
  };
  assert.equal(arriveBy([live], iso(5000), 0, now).length, 0);
  assert.equal(
    arriveBy(
      [
        {
          ...journey,
          support: {
            kind: "schedule",
            serviceDate: "20261101",
            verified: false,
          },
        },
      ],
      iso(700),
      0,
      now,
    ).length,
    0,
  );
  assert.equal(arriveBy([journey], iso(700), 60, now).length, 1);
});
test("campus time resolves midnight and both DST folds explicitly, rejects gaps and impossible dates", () => {
  assert.equal(campusDeadline("2026-11-01T01:30"), null);
  assert.equal(
    campusDeadline("2026-11-01T01:30", "earlier"),
    "2026-11-01T05:30:00.000Z",
  );
  assert.equal(
    campusDeadline("2026-11-01T01:30", "later"),
    "2026-11-01T06:30:00.000Z",
  );
  assert.equal(campusDeadline("2026-03-08T02:30"), null);
  assert.equal(campusDeadline("2026-10-31T23:59"), "2026-11-01T03:59:00.000Z");
  assert.equal(campusDeadline("2026-11-01T00:01"), "2026-11-01T04:01:00.000Z");
  assert.equal(campusDeadline("2026-02-30T10:00"), null);
});
test("evaluation keeps loop occurrences separate, deduplicates and exposes missing, stale and unmatched evidence", () => {
  const p: Prediction = {
    ...row,
    instance_key: "instance",
    route_id: "route",
    trip_id: "trip",
    stop_id: "stop",
    stop_sequence: 3,
  } as Prediction;
  const o = {
    id: "o",
    instance_key: "instance",
    trip_id: "trip",
    stop_id: "stop",
    stop_sequence: 1,
    observed_at: iso(130),
    evidence: "source_vehicle_stopped_at",
  };
  const report = evaluate(
    [
      p,
      p,
      { ...p, id: "missing", arrival_at: null },
      { ...p, id: "stale", valid_until: iso(-1) },
    ],
    [o],
    now + 7200000,
  );
  assert.deepEqual(report.counts, {
    predictions: 3,
    matched: 0,
    independentEvents: 0,
    stale: 1,
    missing: 1,
    pending: 0,
    unmatched: 1,
  });
  const matched = evaluate([p], [{ ...o, stop_sequence: 3 }], now + 7200000);
  assert.equal(matched.errorSeconds.bias, 10);
  assert.equal(matched.calibration.enabled, false);
  assert.deepEqual(matched.routes, []);
  assert.equal(
    evaluate(
      [p],
      [{ ...o, stop_sequence: 3, evidence: "proximity" }],
      now + 7200000,
    ).counts.matched,
    0,
  );
});

test("prediction archive captures accepted revisions atomically without allowing browser access", async () => {
  const { localDatabase } = await import("../../scripts/transit/local-db");
  const { saveStatic, saveRealtime } =
    await import("../../scripts/transit/store");
  const { staticCatalog, context, normalize } =
    await import("../../scripts/transit/model");
  const { archive, message, update, NOW } = await import("./fixtures");
  const { engine, db } = await localDatabase();
  try {
    const catalog = staticCatalog(archive());
    await saveStatic(db, catalog, new Date(NOW));
    const snapshot = normalize(
      "arrivals",
      message([update()]),
      context(catalog),
      NOW,
    );
    await saveRealtime(db, "arrivals", snapshot, new Date(NOW));
    await saveRealtime(db, "arrivals", snapshot, new Date(NOW));
    const count = Number(
      (
        await db.query(
          "select count(*) n from archride_private.arrival_predictions",
        )
      ).rows[0].n,
    );
    assert.equal(count, snapshot.rows.length);
    const { readFile } = await import("node:fs/promises");
    const sql = await readFile("scripts/transit/evaluation-report.sql", "utf8");
    const report = (await db.query(sql)).rows[0].report as {
      counts: { predictions: number; matched: number };
    };
    assert.equal(report.counts.predictions, count);
    assert.equal(report.counts.matched, 0);
    const prediction = (
      await db.query(
        "select * from archride_private.arrival_predictions where arrival_at is not null order by stop_sequence limit 1",
      )
    ).rows[0];
    const observed = new Date(
      new Date(String(prediction.arrival_at)).getTime() + 10000,
    ).toISOString();
    const params = [
      prediction.trip_id,
      prediction.instance_key,
      prediction.stop_id,
      prediction.stop_sequence,
      observed,
    ];
    await db.query(
      "insert into public.transit_arrival_events(id,vehicle_id,trip_id,instance_key,stop_id,stop_sequence,observed_at,received_at,evidence) values ('test','test',$1,$2,$3,$4,$5,$5,'source_vehicle_stopped_at')",
      params,
    );
    const matched = (await db.query(sql)).rows[0].report as {
      counts: { matched: number };
      errorSeconds: { bias: number };
    };
    assert.equal(matched.counts.matched, 1);
    assert.equal(matched.errorSeconds.bias, 10);
    await db.query(
      "update public.transit_arrival_events set stop_sequence=999 where id='test'",
    );
    assert.equal(
      ((await db.query(sql)).rows[0].report as { counts: { matched: number } })
        .counts.matched,
      0,
    );

    await db.query("set role anon");
    await assert.rejects(
      db.query("select * from archride_private.arrival_predictions"),
      /permission denied/,
    );
    await db.query("reset role");
  } finally {
    await engine.close();
  }
});

test("published schedules honor calendars, exceptions, midnight and repeated loop occurrences", async () => {
  const { operatesOn, serviceInstant, scheduledJourney } =
    await import("../../src/lib/transit/service-times");
  const service = {
    id: "service",
    calendar: { start_date: "20260101", end_date: "20261231", sunday: "1" },
    exceptions: [{ date: "20261108", exception_type: "2" }],
  } as unknown as import("../../src/lib/supabase/database.types").Tables<"transit_services">;
  assert(operatesOn(service, "20261101"));
  assert(!operatesOn(service, "20261108"));
  assert(!operatesOn(service, "20271101"));
  assert.equal(serviceInstant("20261031", 90000), "2026-11-01T05:00:00.000Z");
  const stop = {
    trip_id: "trip",
    stop_id: "same",
    stop_sequence: 1,
    pickup_type: 0,
    drop_off_type: 0,
    departure_seconds: 36000,
    arrival_seconds: 36000,
  } as import("../../src/lib/supabase/database.types").Tables<"transit_stop_times">;
  const input = {
    id: "j",
    date: "20261101",
    service,
    trip: { id: "trip", service_id: "service", active: true },
    boarding: stop,
    alighting: { ...stop, stop_sequence: 3, arrival_seconds: 36600 },
    walkToSeconds: 120,
    walkFromSeconds: 180,
    boardingBufferSeconds: 60,
    verifiedWalking: true,
    frequencyTemplate: false,
  };
  const result = scheduledJourney(input);
  assert(result);
  assert.equal(result.destinationArrivalAt, "2026-11-01T15:13:00.000Z");
  assert.equal(result.departureAt, "2026-11-01T14:57:00.000Z");
  assert.equal(scheduledJourney({ ...input, frequencyTemplate: true }), null);
  assert.equal(scheduledJourney({ ...input, alighting: stop }), null);
  assert.equal(
    scheduledJourney({
      ...input,
      trip: { ...input.trip, service_id: "wrong-service" },
    }),
    null,
  );
  assert.equal(
    scheduledJourney({ ...input, trip: { ...input.trip, active: false } }),
    null,
  );
});
