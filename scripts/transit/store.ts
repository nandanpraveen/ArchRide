import {
  assert,
  SOURCE,
  context,
  type Catalog,
  type Feed,
  type Realtime,
  type Row,
  type Context,
} from "./model";
export interface DB {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}
const tables = new Set([
  "transit_routes",
  "transit_stops",
  "transit_shapes",
  "transit_services",
  "transit_trips",
  "transit_stop_times",
  "transit_frequencies",
  "transit_vehicles",
  "transit_observations",
  "transit_arrivals",
  "transit_alerts",
  "transit_alert_entities",
  "transit_arrival_events",
]);
const quote = (s: string) => {
  assert(/^[a-z_]+$/.test(s), "invalid_identifier");
  return '"' + s + '"';
};
// Batched, parameterized inserts; only hard-coded table names and normalized columns allowed.
export async function upsert(
  db: DB,
  table: string,
  rows: Row[],
  clock?: string,
  conflict = "id",
) {
  assert(tables.has(table), "invalid_table");
  for (let start = 0; start < rows.length; start += 250) {
    const batch = rows.slice(start, start + 250),
      cols = Object.keys(batch[0]),
      values: unknown[] = [];
    const placeholders = batch
      .map(
        (r) =>
          "(" +
          cols
            .map((k) => {
              const v = r[k];
              values.push(
                v !== null && typeof v === "object" ? JSON.stringify(v) : v,
              );
              return "$" + values.length;
            })
            .join(",") +
          ")",
      )
      .join(",");
    const updates = cols
      .filter((k) => !conflict.split(",").includes(k))
      .map((k) => `${quote(k)}=excluded.${quote(k)}`)
      .join(",");
    await db.query(
      `insert into public.${quote(table)} (${cols.map(quote).join(",")}) values ${placeholders}
   on conflict (${conflict.split(",").map(quote).join(",")}) ${clock === "immutable" ? "do nothing" : `do update set ${updates}${clock ? ` where excluded.${quote(clock)} > ${quote(table)}.${quote(clock)}` : ""}`}`,
      values,
    );
  }
}
export async function transaction<T>(db: DB, fn: () => Promise<T>) {
  await db.query("begin");
  try {
    const value = await fn();
    await db.query("commit");
    return value;
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}
export async function saveStatic(db: DB, c: Catalog, now = new Date()) {
  return transaction(db, async () => {
    for (const table of ["transit_routes", "transit_stops", "transit_trips"])
      await db.query(
        `update public.${table} set active=false where source_id=$1`,
        [SOURCE],
      );
    // Replace stop occurrences atomically, retaining obsolete trips for historical FK references.
    await db.query(
      "delete from public.transit_stop_times where trip_id in (select id from public.transit_trips where source_id=$1)",
      [SOURCE],
    );
    await db.query(
      "delete from public.transit_frequencies where trip_id in (select id from public.transit_trips where source_id=$1)",
      [SOURCE],
    );
    for (const [table, rows] of Object.entries(c))
      await upsert(db, table, rows);
    await health(
      db,
      "static",
      null,
      Object.values(c).reduce((n, r) => n + r.length, 0),
      null,
      now,
    );
  });
}
export async function loadContext(
  db: DB,
  tripIds?: string[],
): Promise<Context> {
  const c: Catalog = {};
  for (const table of ["transit_routes", "transit_stops", "transit_trips"])
    c[table] = (
      await db.query<Row>(
        `select ${table === "transit_trips" ? "id,route_id,service_id" : "id"} from public.${table} where source_id=$1 and active${table === "transit_trips" && tripIds ? " and id=any($2::text[])" : ""}`,
        table === "transit_trips" && tripIds ? [SOURCE, tripIds] : [SOURCE],
      )
    ).rows;
  c.transit_stop_times = (
    await db.query<Row>(
      `select s.id,s.stop_id,s.trip_id,s.stop_sequence,s.arrival_seconds,s.departure_seconds from public.transit_stop_times s join public.transit_trips t on t.id=s.trip_id where t.source_id=$1 and t.active${tripIds ? " and t.id=any($2::text[])" : ""}`,
      tripIds ? [SOURCE, tripIds] : [SOURCE],
    )
  ).rows;
  [c.transit_services, c.transit_frequencies] = await Promise.all([
    db.query<Row>(`select s.* from public.transit_services s where s.id in (select service_id from public.transit_trips where source_id=$1 and active${tripIds ? " and id=any($2::text[])" : ""})`, tripIds ? [SOURCE, tripIds] : [SOURCE]).then(r => r.rows),
    db.query<Row>(`select f.trip_id from public.transit_frequencies f join public.transit_trips t on t.id=f.trip_id where t.source_id=$1 and t.active${tripIds ? " and t.id=any($2::text[])" : ""}`, tripIds ? [SOURCE, tripIds] : [SOURCE]).then(r => r.rows),
  ]);
  assert(
    c.transit_routes.length &&
      c.transit_stops.length &&
      (tripIds !== undefined || c.transit_trips.length),
    "static_not_configured",
  );
  return context(c);
}
export async function health(
  db: DB,
  feed: Feed,
  stamp: string | null,
  count: number,
  error: string | null,
  now = new Date(),
  retryAfterAt: string | null = null,
) {
  const feedId = SOURCE + ":" + feed;
  await db.query(
    `update public.feed_status set last_attempt_at=$2, updated_at=$2,
  last_success_at=case when $3::text is null then $2 else last_success_at end,
  source_timestamp=case when $3::text is null then $4::timestamptz else source_timestamp end,
  entity_count=case when $3::text is null then $5::integer else entity_count end,
  state=case when $3::text is null then 'healthy' when last_success_at is null then 'unavailable' else 'stale' end,
  error_code=$3, next_attempt_at=$6 where id=$1`,
    [feedId, now.toISOString(), error, stamp, count, retryAfterAt],
  );
  await db.query(
    "insert into public.transit_job_runs(feed_id,outcome,entity_count,error_code) values ($1,$2,$3,$4)",
    [feedId, error ? "failed" : "success", count, error],
  );
}
export async function saveRealtime(
  db: DB,
  feed: Exclude<Feed, "static">,
  r: Realtime,
  now = new Date(),
) {
  return transaction(db, async () => {
    const previous = (
      await db.query<{ source_timestamp: string | null }>(
        "select source_timestamp from public.feed_status where id=$1 for update",
        [SOURCE + ":" + feed],
      )
    ).rows[0];
    // An unchanged snapshot may be successfully fetched again, but it has not become fresher.
    if (
      previous?.source_timestamp &&
      Date.parse(String(previous.source_timestamp)) > Date.parse(r.timestamp)
    )
      return { outcome: "out_of_order", count: 0 };
    if (feed === "vehicles") {
      const events: Row[] = [];
      for (const event of r.events) {
        const previous = (
          await db.query(
            "select current_status,stop_id,stop_sequence,instance_key,position_timestamp from public.transit_vehicles where id=$1",
            [event.vehicle_id],
          )
        ).rows[0];
        const incomingTime = Date.parse(String(event.observed_at));
        const newer =
          !previous ||
          incomingTime > Date.parse(String(previous.position_timestamp));
        const sameStop =
          previous &&
          previous.current_status === "STOPPED_AT" &&
          previous.stop_id === event.stop_id &&
          previous.stop_sequence === event.stop_sequence &&
          previous.instance_key === event.instance_key;
        if (newer && !sameStop) events.push(event);
      }
      await upsert(db, "transit_vehicles", r.rows, "position_timestamp");
      await upsert(
        db,
        "transit_observations",
        r.rows,
        "immutable",
        "id,position_timestamp",
      );
      await upsert(db, "transit_arrival_events", events, "immutable");
    } else if (feed === "arrivals") {
      await upsert(db, "transit_arrivals", r.rows, "update_timestamp");
      // Full dataset absence means unavailable prediction, never route cancellation.
      // Only expire absent rows after a completely valid snapshot, with a strictly newer feed time.
      if (!r.rejected)
        await db.query(
          `update public.transit_arrivals set valid_until=least(valid_until,$2::timestamptz)
    where source_id=$1 and source_timestamp < $3 and not (id=any($4::text[]))`,
          [SOURCE, now.toISOString(), r.timestamp, r.rows.map((x) => x.id)],
        );
    } else {
      await upsert(db, "transit_alerts", r.rows, "source_timestamp");
      // Replace selectors only for alerts whose stored revision matches this snapshot.
      for (const row of r.rows) {
        const current = (
          await db.query(
            "select id from public.transit_alerts where id=$1 and source_timestamp=$2",
            [row.id, r.timestamp],
          )
        ).rows;
        if (current.length) {
          await db.query(
            "delete from public.transit_alert_entities where alert_id=$1",
            [row.id],
          );
          await upsert(
            db,
            "transit_alert_entities",
            r.affected.filter((x) => x.alert_id === row.id),
          );
        }
      }
      if (!r.rejected)
        await db.query(
          "update public.transit_alerts set active=false where source_id=$1 and source_timestamp < $2 and not(id=any($3::text[]))",
          [SOURCE, r.timestamp, r.rows.map((x) => x.id)],
        );
    }
    await health(
      db,
      feed,
      r.timestamp,
      r.rows.length,
      r.rejected ? "partial_rejection" : null,
      now,
    );
    return {
      outcome: r.rejected ? "partial" : "success",
      count: r.rows.length,
    };
  });
}
export async function cleanup(db: DB) {
  return transaction(db, async () => {
    await db.query(
      `delete from public.transit_observations where received_at < now() - make_interval(hours => (select observation_hours from public.transit_retention where id))`,
    );
    await db.query(
      `delete from public.transit_arrival_events where received_at < now() - make_interval(days => (select event_days from public.transit_retention where id))`,
    );
    await db.query(
      `delete from public.transit_job_runs where finished_at < now() - make_interval(days => (select job_days from public.transit_retention where id))`,
    );
    await db.query(
      "delete from public.transit_arrivals where valid_until < now()",
    );
    await db.query(
      "delete from public.transit_walking_cache where expires_at < now()",
    );
    await db.query(
      "delete from public.transit_vehicles where received_at < now()-interval '7 days'",
    );
    await db.query(
      "delete from public.transit_alerts where not active and received_at < now()-interval '7 days'",
    );
  });
}
