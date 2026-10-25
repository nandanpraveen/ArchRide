import { parse } from "csv-parse/sync";
import { unzipSync, strFromU8 } from "fflate";
import GtfsRealtime from "gtfs-realtime-bindings";

export const SOURCE = "uga-passio";
export const PREFIX = `${SOURCE}:`;
export const id = (raw: string) => PREFIX + raw;
export const endpoints = {
  static: "https://passio3.com/uga/passioTransit/gtfs/google_transit.zip",
  vehicles:
    "https://passio3.com/uga/passioTransit/gtfs/realtime/vehiclePositions",
  arrivals: "https://passio3.com/uga/passioTransit/gtfs/realtime/tripUpdates",
  alerts: "https://passio3.com/uga/passioTransit/gtfs/realtime/serviceAlerts",
} as const;
export type Feed = keyof typeof endpoints;
export type Row = Record<string, unknown> & { id: string };
export type Catalog = Record<string, Row[]>;
export class FeedError extends Error {
  constructor(
    public code: string,
    public retryAfterAt: string | null = null,
  ) {
    super(code);
  }
}
export function assert(ok: unknown, code: string): asserts ok {
  if (!ok) throw new FeedError(code);
}
export function seconds(value: string): number | null {
  if (!value) return null;
  assert(/^\d{2,3}:\d{2}:\d{2}$/.test(value), "invalid_time");
  const [h, m, s] = value.split(":").map(Number);
  assert(m < 60 && s < 60 && h < 168, "invalid_time");
  return h * 3600 + m * 60 + s;
}
function integer(raw: string | undefined, nullable = true): number | null {
  if ((raw === undefined || raw === "") && nullable) return null;
  assert(raw !== undefined && /^\d+$/.test(raw), "invalid_integer");
  return Number(raw);
}
function coordinate(raw: string | number | undefined, max: number) {
  assert(raw !== undefined && raw !== "", "missing_coordinate");
  const v = Number(raw);
  assert(Number.isFinite(v) && Math.abs(v) <= max, "invalid_coordinate");
  return v;
}
export function staticCatalog(bytes: Uint8Array): Catalog {
  // Limit decompressed archive before allocating content. Never extract archive paths to disk.
  let uncompressedSize = 0;
  const zip = unzipSync(bytes, {
    filter: (f) => {
      uncompressedSize += f.originalSize;
      assert(
        f.originalSize < 40_000_000 && uncompressedSize < 80_000_000,
        "archive_too_large",
      );
      return /^(agency|stops|routes|trips|stop_times|shapes|calendar|calendar_dates|frequencies)\.txt$/.test(
        f.name,
      );
    },
  });
  assert(
    Object.values(zip).reduce((n, b) => n + b.length, 0) < 80_000_000,
    "archive_too_large",
  );
  const csv = (name: string, required = false): Record<string, string>[] => {
    const b = zip[name + ".txt"];
    assert(b || !required, "missing_" + name);
    return b
      ? parse(strFromU8(b), {
          columns: true,
          bom: true,
          skip_empty_lines: true,
        })
      : [];
  };
  const agencies = csv("agency", true);
  assert(
    agencies.length > 0 &&
      agencies.every((a) => a.agency_timezone === "America/New_York"),
    "unexpected_timezone",
  );
  const base = (raw: string) => {
    assert(raw, "missing_id");
    return { id: id(raw), source_id: SOURCE, source_id_raw: raw };
  };
  const routes = csv("routes", true).map((r) => ({
    ...base(r.route_id),
    short_name: r.route_short_name,
    long_name: r.route_long_name,
    color: /^[0-9a-f]{6}$/i.test(r.route_color) ? "#" + r.route_color : null,
    text_color: /^[0-9a-f]{6}$/i.test(r.route_text_color)
      ? "#" + r.route_text_color
      : null,
    active: true,
  }));
  const stops = csv("stops", true).map((s) => ({
    ...base(s.stop_id),
    name: s.stop_name,
    latitude: coordinate(s.stop_lat, 90),
    longitude: coordinate(s.stop_lon, 180),
    location_type: integer(s.location_type) || 0,
    parent_station: s.parent_station || null,
    active: true,
  }));
  const shapes = new Map<string, { sequence: number; point: number[] }[]>();
  for (const s of csv("shapes")) {
    const p = shapes.get(s.shape_id) || [];
    p.push({
      sequence: integer(s.shape_pt_sequence, false)!,
      point: [coordinate(s.shape_pt_lon, 180), coordinate(s.shape_pt_lat, 90)],
    });
    shapes.set(s.shape_id, p);
  }
  const services = new Map<string, Row>();
  for (const s of csv("calendar"))
    services.set(s.service_id, {
      ...base(s.service_id),
      calendar: s,
      exceptions: [],
    });
  for (const e of csv("calendar_dates")) {
    const s = services.get(e.service_id) || {
      ...base(e.service_id),
      calendar: null,
      exceptions: [],
    };
    (s.exceptions as unknown[]).push(e);
    services.set(e.service_id, s);
  }
  const trips = csv("trips", true).map((t) => ({
    ...base(t.trip_id),
    route_id: id(t.route_id),
    service_id: id(t.service_id),
    shape_id: t.shape_id ? id(t.shape_id) : null,
    direction_id: integer(t.direction_id),
    headsign: t.trip_headsign || null,
    active: true,
  }));
  const times = csv("stop_times", true).map((s) => ({
    id: `${id(s.trip_id)}:${integer(s.stop_sequence, false)}`,
    trip_id: id(s.trip_id),
    stop_id: id(s.stop_id),
    stop_sequence: integer(s.stop_sequence, false),
    arrival_seconds: seconds(s.arrival_time),
    departure_seconds: seconds(s.departure_time),
    pickup_type: integer(s.pickup_type),
    drop_off_type: integer(s.drop_off_type),
  }));
  const frequencies = csv("frequencies").map((f) => ({
    id: `${id(f.trip_id)}:${f.start_time}`,
    trip_id: id(f.trip_id),
    start_seconds: seconds(f.start_time),
    end_seconds: seconds(f.end_time),
    headway_seconds: integer(f.headway_secs, false),
    exact_times: f.exact_times === "1",
  }));
  assert(
    routes.length && stops.length && trips.length && times.length,
    "empty_static",
  );
  const c: Catalog = {
    transit_routes: routes,
    transit_stops: stops,
    transit_shapes: [...shapes].map(([raw, p]) => ({
      ...base(raw),
      points: p.sort((a, b) => a.sequence - b.sequence).map((x) => x.point),
    })),
    transit_services: [...services.values()],
    transit_trips: trips,
    transit_stop_times: times,
    transit_frequencies: frequencies,
  };
  // Fail the entire catalog before touching the database on broken source references or duplicates.
  for (const rows of Object.values(c))
    assert(
      new Set(rows.map((r) => r.id)).size === rows.length,
      "duplicate_static_id",
    );
  const keys = (table: string) => new Set(c[table].map((r) => r.id));
  const rk = keys("transit_routes"),
    sk = keys("transit_stops"),
    tk = keys("transit_trips"),
    shk = keys("transit_shapes"),
    svk = keys("transit_services");
  for (const t of trips)
    assert(
      rk.has(t.route_id) &&
        svk.has(t.service_id) &&
        (!t.shape_id || shk.has(t.shape_id)),
      "unknown_static_reference",
    );
  for (const t of times)
    assert(tk.has(t.trip_id) && sk.has(t.stop_id), "unknown_static_reference");
  for (const f of frequencies)
    assert(tk.has(f.trip_id), "unknown_static_reference");
  return c;
}
export const decode = (b: Uint8Array) =>
  GtfsRealtime.transit_realtime.FeedMessage.decode(b);
type Message = ReturnType<typeof decode>;
type TripDescriptor = NonNullable<
  NonNullable<Message["entity"][number]["tripUpdate"]>["trip"]
>;
export type Context = {
  trips: Map<string, Row>;
  stops: Set<string>;
  routes: Set<string>;
  occurrences: Map<string, string>;
};
export function context(c: Catalog): Context {
  return {
    trips: new Map(c.transit_trips.map((t) => [t.id, t])),
    stops: new Set(c.transit_stops.map((s) => s.id)),
    routes: new Set(c.transit_routes.map((r) => r.id)),
    occurrences: new Map(
      c.transit_stop_times.map((s) => [s.id, String(s.stop_id)]),
    ),
  };
}
function timestamp(n: unknown, now: number): string {
  const v = Number(n);
  assert(
    Number.isSafeInteger(v) && v > 0 && v * 1000 <= now + 120_000,
    "invalid_timestamp",
  );
  return new Date(v * 1000).toISOString();
}
function tripInfo(
  t: TripDescriptor | null | undefined,
  c: Context,
  vehicleId?: string | null,
) {
  if (!t?.tripId) return null;
  const trip = c.trips.get(id(t.tripId));
  assert(trip, "unknown_trip");
  assert(!t.routeId || trip.route_id === id(t.routeId), "trip_route_mismatch");
  assert(!t.startDate || /^\d{8}$/.test(t.startDate), "invalid_service_date");
  if (t.startTime) seconds(t.startTime);
  return {
    trip,
    instance: [
      id(t.tripId),
      t.startDate || "",
      t.startTime || "",
      ...(vehicleId ? ["vehicle:" + vehicleId] : []),
    ].join("|"),
  };
}
const text = (
  v:
    | { translation?: { text: string; language?: string | null }[] | null }
    | null
    | undefined,
) =>
  v?.translation?.find((t) => t.language === "en")?.text ||
  v?.translation?.[0]?.text ||
  "";
export type Realtime = {
  timestamp: string;
  rows: Row[];
  affected: Row[];
  events: Row[];
  rejected: number;
  rejectionReasons?: Record<string, number>;
  entityCount: number;
};
export function normalize(
  feed: Exclude<Feed, "static">,
  b: Uint8Array,
  c: Context,
  now = Date.now(),
): Realtime {
  const m = decode(b);
  assert(
    m.header.gtfsRealtimeVersion === "1.0" ||
      m.header.gtfsRealtimeVersion === "2.0",
    "unsupported_gtfs_version",
  );
  assert(!m.header.incrementality, "differential_not_supported");
  const stamp = timestamp(m.header.timestamp, now),
    received = new Date(now).toISOString();
  const result: Realtime = {
    timestamp: stamp,
    rows: [],
    affected: [],
    events: [],
    rejected: 0,
    entityCount: m.entity.length,
  };
  const ids = new Set<string>();
  for (const e of m.entity) {
    try {
      assert(e.id && !ids.has(e.id), "duplicate_entity");
      ids.add(e.id);
      assert(!e.isDeleted, "deleted_full_dataset_entity");
      if (feed === "vehicles") {
        const v = e.vehicle;
        assert(v?.position, "missing_position");
        assert(
          Object.hasOwn(v.position, "latitude") &&
            Object.hasOwn(v.position, "longitude"),
          "missing_coordinate",
        );
        const t = tripInfo(v.trip, c, v.vehicle?.id),
          raw = v.vehicle?.id || e.id;
        const route =
          t?.trip.route_id || (v.trip?.routeId ? id(v.trip.routeId) : null);
        assert(!route || c.routes.has(String(route)), "unknown_route");
        const stop = v.stopId ? id(v.stopId) : null;
        assert(!stop || c.stops.has(stop), "unknown_stop");
        if (t && Object.hasOwn(v, "currentStopSequence") && stop)
          assert(
            c.occurrences.get(`${t.trip.id}:${v.currentStopSequence}`) === stop,
            "stop_sequence_mismatch",
          );
        const positionTime = v.timestamp ? timestamp(v.timestamp, now) : stamp;
        const row: Row = {
          id: id(raw),
          source_id: SOURCE,
          source_id_raw: raw,
          route_id: route,
          trip_id: t?.trip.id || null,
          instance_key: t?.instance || null,
          stop_id: stop,
          stop_sequence: Object.hasOwn(v, "currentStopSequence")
            ? v.currentStopSequence
            : null,
          latitude: coordinate(v.position.latitude, 90),
          longitude: coordinate(v.position.longitude, 180),
          bearing: Object.hasOwn(v.position, "bearing")
            ? v.position.bearing
            : null,
          speed: Object.hasOwn(v.position, "speed") ? v.position.speed : null,
          source_timestamp: stamp,
          received_at: received,
          position_timestamp: positionTime,
          position_timestamp_kind: v.timestamp ? "vehicle" : "feed",
          current_status:
            ["INCOMING_AT", "STOPPED_AT", "IN_TRANSIT_TO"][
              v.currentStatus ?? 2
            ] || "UNKNOWN",
        };
        assert(
          row.bearing === null ||
            (Number(row.bearing) >= 0 && Number(row.bearing) <= 360),
          "invalid_bearing",
        );
        assert(row.speed === null || Number(row.speed) >= 0, "invalid_speed");
        result.rows.push(row);
        // Feed-level time does not prove a fresh stop observation.
        if (row.current_status === "STOPPED_AT" && stop && v.timestamp)
          result.events.push({
            id: `${row.id}:${t?.instance || ""}:${v.currentStopSequence ?? stop}:${positionTime}`,
            vehicle_id: row.id,
            trip_id: row.trip_id,
            instance_key: row.instance_key,
            stop_id: stop,
            stop_sequence: row.stop_sequence,
            observed_at: positionTime,
            received_at: received,
            evidence: "source_vehicle_stopped_at",
          });
      } else if (feed === "arrivals") {
        const u = e.tripUpdate;
        assert(u, "missing_trip_update");
        const t = tripInfo(u.trip, c, u.vehicle?.id);
        assert(t, "missing_trip");
        // Frequency trips need an instance start time; otherwise simultaneous runs collide.
        assert(u.trip.startDate && u.trip.startTime, "ambiguous_trip_instance");
        const updateTime = u.timestamp ? timestamp(u.timestamp, now) : stamp;
        const canceled =
          u.trip.scheduleRelationship === 3 ||
          u.trip.scheduleRelationship === 7;
        // Persist cancellation even when no stop updates were sent.
        const updates = canceled
          ? [...c.occurrences]
              .filter(([k]) => k.startsWith(t.trip.id + ":"))
              .map(([k, s]) => ({
                stopSequence: Number(k.slice(k.lastIndexOf(":") + 1)),
                stopId: s.slice(PREFIX.length),
                arrival: null,
                departure: null,
                scheduleRelationship: 1,
              }))
          : u.stopTimeUpdate;
        const pending: Row[] = [];
        for (const s of updates || []) {
          let sequence = Object.hasOwn(s, "stopSequence")
            ? s.stopSequence
            : undefined;
          if (sequence == null && s.stopId) {
            const matches = [...c.occurrences].filter(
              ([k, v]) => k.startsWith(t.trip.id + ":") && v === id(s.stopId!),
            );
            assert(matches.length === 1, "ambiguous_stop");
            sequence = Number(matches[0][0].split(":").at(-1));
          }
          assert(sequence != null, "missing_sequence");
          const stop = c.occurrences.get(`${t.trip.id}:${sequence}`);
          assert(
            stop && (!s.stopId || stop === id(s.stopId)),
            "unknown_stop_occurrence",
          );
          const relation = canceled
            ? "CANCELED"
            : ["SCHEDULED", "SKIPPED", "NO_DATA", "UNSCHEDULED"][
                s.scheduleRelationship ?? 0
              ] || "NO_DATA";
          // Only absolute source times; never turn delay-only messages into guessed ETAs.
          const epoch = (n: unknown) =>
            n && Number(n) > 0
              ? new Date(Number(n) * 1000).toISOString()
              : null;
          const arrival =
              relation === "SCHEDULED" ? epoch(s.arrival?.time) : null,
            departure =
              relation === "SCHEDULED" ? epoch(s.departure?.time) : null;
          const uncertainty =
            (s.arrival && Object.hasOwn(s.arrival, "uncertainty")
              ? s.arrival.uncertainty
              : s.departure && Object.hasOwn(s.departure, "uncertainty")
                ? s.departure.uncertainty
                : null) ?? null;
          assert(
            uncertainty === null || uncertainty >= 0,
            "invalid_uncertainty",
          );
          pending.push({
            id: `${t.instance}|${sequence}`,
            source_id: SOURCE,
            trip_id: t.trip.id,
            instance_key: t.instance,
            route_id: t.trip.route_id,
            stop_id: stop,
            stop_sequence: sequence,
            arrival_at: arrival,
            departure_at: departure,
            uncertainty_seconds: uncertainty,
            relationship: relation,
            source_timestamp: stamp,
            received_at: received,
            update_timestamp: updateTime,
            timestamp_kind: u.timestamp ? "trip" : "feed",
            provenance: "source",
            valid_until: new Date(
              Math.min(now + 15 * 60_000, Date.parse(stamp) + 15 * 60_000),
            ).toISOString(),
          });
        }
        result.rows.push(...pending);
      } else {
        const a = e.alert;
        assert(a, "missing_alert");
        const alertId = id(e.id);
        const safeUrl = text(a.url);
        assert(!safeUrl || /^https?:\/\//i.test(safeUrl), "invalid_alert_url");
        const affected: Row[] = [];
        for (const [index, s] of (a.informedEntity || []).entries()) {
          const route = s.routeId ? id(s.routeId) : null,
            stop = s.stopId ? id(s.stopId) : null,
            trip = s.trip?.tripId ? id(s.trip.tripId) : null;
          assert(
            (!route || c.routes.has(route)) &&
              (!stop || c.stops.has(stop)) &&
              (!trip || c.trips.has(trip)),
            "unknown_alert_entity",
          );
          affected.push({
            id: `${alertId}:${index}`,
            alert_id: alertId,
            route_id: route,
            stop_id: stop,
            trip_id: trip,
            selector: JSON.parse(JSON.stringify(s)),
          });
        }
        result.rows.push({
          id: alertId,
          source_id: SOURCE,
          source_id_raw: e.id,
          header: text(a.headerText),
          description: text(a.descriptionText),
          url: safeUrl || null,
          cause: String(a.cause ?? "UNKNOWN"),
          effect: String(a.effect ?? "UNKNOWN"),
          active_periods: (a.activePeriod || []).map((p) => ({
            start: p.start ? Number(p.start) : null,
            end: p.end ? Number(p.end) : null,
          })),
          informed_entities: JSON.parse(JSON.stringify(a.informedEntity || [])),
          source_timestamp: stamp,
          received_at: received,
          active: true,
          provenance: "source",
        });
        result.affected.push(...affected);
      }
    } catch (err) {
      if (!(err instanceof FeedError)) throw err;
      result.rejected++;
      result.rejectionReasons ??= {};
      result.rejectionReasons[err.code] = (result.rejectionReasons[err.code] ?? 0) + 1;
    }
  }
  assert(
    !m.entity.length || result.rows.length || !result.rejected,
    "all_entities_rejected",
  );
  assert(
    new Set(result.rows.map((r) => r.id)).size === result.rows.length,
    "duplicate_normalized_id",
  );
  return result;
}
