import type { ActiveTrip, PlaceRef } from "./personal";
import type { Arrival, Route, Stop } from "./transit/contracts";
import { activeTransitAlerts } from "./transit/contracts";
import { assessDeadline, type DeadlineAssessment } from "./transit/deadlines";
import { calculatedArrival, newerArrival } from "./transit/estimates";
import { pickWatchedEstimate } from "./watched-buses";
import type { Tables } from "./supabase/database.types";

export type ActiveTiming = {
  state: "live" | "missing" | "stale" | "cancelled" | "passed" | "unreachable" | "walking" | "expired";
  reason: string;
  boardingAt: string | null;
  arrivalAt: string | null;
  sourceTime: string | null;
  routeId: string | null;
  changeMinutes: number | null;
  assessment: DeadlineAssessment | null;
};

/** An absent row is not cancellation. Keep prior evidence only until its own validity expires. */
export function mergeActiveArrivals(previous: Arrival[], incoming: Arrival[]) {
  const rows = new Map(previous.map((row) => [row.id, row]));
  for (const row of incoming) {
    if (!Number.isFinite(Date.parse(row.update_timestamp))) continue;
    const old = rows.get(row.id);
    rows.set(row.id, old ? newerArrival(old, row) : row);
  }
  return [...rows.values()].slice(-100);
}

/** Resolve the exact selected trip instance and stop occurrences again on every clock tick. */
export function activeTripTiming(
  trip: ActiveTrip,
  arrivals: Arrival[],
  connected: boolean,
  bufferSeconds: number,
  now = Date.now(),
): ActiveTiming {
  const base = {
    boardingAt: null,
    arrivalAt: null,
    sourceTime: null,
    routeId: null,
    changeMinutes: null,
    assessment: trip.deadline ? assessDeadline(null, trip.deadline, bufferSeconds, now) : null,
  };
  if (!(Date.parse(trip.expiresAt) > now))
    return { ...base, state: "expired", reason: "This trip has expired. Compare current options before continuing." };
  if (trip.mode === "walk" || trip.step >= 3)
    return { ...base, state: "walking", reason: "Confirm your progress as you walk. Your current location and arrival time are not tracked." };
  const rows = arrivals.filter((row) =>
    row.instance_key === trip.instanceKey &&
    (!trip.tripId || row.trip_id === trip.tripId) &&
    row.provenance === "source",
  );
  const latest = (stop: PlaceRef | null, sequence: number | null | undefined) =>
    sequence == null ? null : rows
      .filter((row) => row.stop_id === stop?.id && row.stop_sequence === sequence)
      .sort((a, b) => Date.parse(b.update_timestamp) - Date.parse(a.update_timestamp))[0] ?? null;
  const boardRow = latest(trip.boarding, trip.boardingSequence);
  const exitRow = latest(trip.alighting, trip.alightingSequence);
  const board = pickWatchedEstimate(boardRow ? [boardRow] : [], now, connected);
  const exit = pickWatchedEstimate(exitRow ? [exitRow] : [], now, connected);
  const needed = trip.step >= 2 ? [exit] : [board, exit];
  const source = {
    ...base,
    routeId: exitRow?.route_id ?? boardRow?.route_id ?? null,
    sourceTime: exit?.sourceTime ?? board?.sourceTime ?? null,
  };
  if (needed.some((estimate) => estimate?.state === "cancelled"))
    return { ...source, state: "cancelled", reason: "The source reports a cancellation or skipped stop for this trip. Confirm your situation and compare alternatives." };
  if (needed.some((estimate) => estimate?.state === "stale") || !connected)
    return { ...source, state: "stale", reason: "Current bus timing cannot be verified. Keep your trip steps, check the signed stop, or compare current options." };
  if (needed.some((estimate) => estimate?.state === "passed"))
    return { ...source, state: "passed", reason: "The predicted stop time has passed. This does not confirm the bus departed. Confirm whether you boarded or compare alternatives." };
  if (needed.some((estimate) => !estimate || estimate.state !== "valid") || trip.walkFromSeconds == null)
    return { ...source, state: "missing", reason: "A prediction for the selected trip or stop occurrence is unavailable. A missing bus is not a cancelled route." };
  const departure = boardRow?.departure_at ? Date.parse(boardRow.departure_at) : NaN;
  const boardingAt = trip.step < 2 ? Number.isFinite(departure) && departure >= Date.parse(board!.arrivalAt!) ? boardRow!.departure_at : board!.arrivalAt : null;
  if (trip.step < 2 && Date.parse(exit!.arrivalAt!) <= Date.parse(boardingAt!))
    return { ...source, state: "missing", reason: "The current stop predictions conflict. Compare options after the source updates." };
  const walkTo = trip.step === 0 ? trip.walkToSeconds : 0;
  const boardingBuffer = trip.step === 0 ? bufferSeconds : 0;
  if (trip.step === 0 && (walkTo == null || Date.parse(boardingAt!) < now + (walkTo + boardingBuffer) * 1000))
    return { ...source, boardingAt, state: "unreachable", reason: "There may not be enough time to reach the stop from your selected origin. If you are already there, confirm that step; otherwise compare alternatives." };
  const arrivalAt = new Date(Date.parse(exit!.arrivalAt!) + trip.walkFromSeconds * 1000).toISOString();
  const support = calculatedArrival(exit!.arrivalAt, needed.filter((estimate) => estimate !== null), now);
  const candidate = {
    id: trip.instanceKey ?? "active",
    departureAt: new Date(now).toISOString(),
    destinationArrivalAt: arrivalAt,
    walkingSeconds: (walkTo ?? 0) + trip.walkFromSeconds,
    boardingBufferSeconds: boardingBuffer,
    support: { kind: "live" as const, estimate: support },
  };
  const change = trip.selectedDestinationArrivalAt
    ? (Date.parse(arrivalAt) - Date.parse(trip.selectedDestinationArrivalAt)) / 60000
    : NaN;
  return {
    ...source,
    state: "live",
    reason: "Official UGA / Passio estimates, including the final walk. Actual arrivals may differ.",
    boardingAt,
    arrivalAt,
    sourceTime: support.sourceTime,
    changeMinutes: Number.isFinite(change) && Math.abs(change) >= 2 ? Math.round(change) : null,
    assessment: trip.deadline ? assessDeadline(candidate, trip.deadline, bufferSeconds, now) : null,
  };
}

/** The only confirmed recovery origin is a stop the student has explicitly reached. */
export function recoveryOrigin(trip: ActiveTrip): PlaceRef | null {
  if (trip.mode === "bus" && trip.step === 1) return trip.boarding;
  if (trip.mode === "bus" && trip.step === 3) return trip.alighting;
  return null;
}

export function relevantTripAlerts(
  alerts: Tables<"transit_alerts">[],
  route: Pick<Route, "id" | "source_id_raw"> | undefined,
  stops: Pick<Stop, "id" | "source_id_raw">[],
  tripId: string | null | undefined,
  now: number,
) {
  return activeTransitAlerts(alerts, now).filter((alert) => {
    if (!Array.isArray(alert.informed_entities) || !alert.informed_entities.length) return true;
    return alert.informed_entities.some((entity) => {
      if (!entity || typeof entity !== "object" || Array.isArray(entity)) return false;
      const trip = entity.trip && typeof entity.trip === "object" && !Array.isArray(entity.trip) ? entity.trip : null;
      return (!entity.routeId || [route?.id, route?.source_id_raw].includes(String(entity.routeId))) &&
        (!entity.stopId || stops.some((stop) => [stop.id, stop.source_id_raw].includes(String(entity.stopId)))) &&
        (!trip?.tripId || [tripId, tripId?.replace(/^uga-passio:/, "")].includes(String(trip.tripId)));
    });
  });
}
