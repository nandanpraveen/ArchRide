import type { Tables } from "@/lib/supabase/database.types";
import type { Arrival, Route, Stop } from "@/lib/transit/contracts";
import { arrivalEstimate, calculatedArrival } from "@/lib/transit/estimates";
import { assessDeadline, type JourneyCandidate } from "@/lib/transit/deadlines";
import { operatesOn, scheduledJourney } from "@/lib/transit/service-times";
import { campusDate } from "@/app/classes/next-class";
import type { LocatedPlace, WalkingPath } from "./walking";
export type JourneyLeg = {
  kind: "walk" | "wait" | "ride";
  label: string;
  seconds: number;
  path?: WalkingPath;
};
export type Journey = JourneyCandidate & {
  mode: "walk" | "bus";
  seconds: number;
  meters: number;
  legs: JourneyLeg[];
  route?: Route;
  headsign?: string;
  board?: Stop;
  alight?: Stop;
  tripId?: string;
  instanceKey?: string;
  boardingSequence?: number;
  alightingSequence?: number;
  arrivalIds?: [string, string];
  verifiedUntil: string;
};
type StopTime = Tables<"transit_stop_times">;
type Trip = Tables<"transit_trips">;
export function haversineMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const r = Math.PI / 180,
    lat = (b.latitude - a.latitude) * r,
    lng = (b.longitude - a.longitude) * r;
  const h =
    Math.sin(lat / 2) ** 2 +
    Math.cos(a.latitude * r) *
      Math.cos(b.latitude * r) *
      Math.sin(lng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
/** Recheck reachability and validity as the page's clock advances. */
export function currentJourney(
  j: Journey,
  now: number,
  connected = true,
): Journey | null {
  if (Date.parse(j.verifiedUntil) <= now) return null;
  if (j.support.kind === "live") {
    const e = j.support.estimate;
    if (
      !connected ||
      e.state !== "valid" ||
      Date.parse(e.validUntil ?? "") <= now ||
      now - Date.parse(e.sourceTime ?? "") > 90000 ||
      now - Date.parse(e.sourceTime ?? "") < -120000
    )
      return null;
    const first = j.legs[0].seconds,
      boardAt = Date.parse(j.departureAt) + (first + j.legs[1].seconds) * 1000;
    if (boardAt < now + (first + j.boardingBufferSeconds) * 1000) return null;
    const wait = (boardAt - now) / 1000 - first,
      legs = j.legs.map((l, i) => (i === 1 ? { ...l, seconds: wait } : l));
    return {
      ...j,
      departureAt: new Date(now).toISOString(),
      seconds: legs.reduce((s, l) => s + l.seconds, 0),
      legs,
    };
  }
  if (j.support.kind === "schedule")
    return Date.parse(j.departureAt) >= now ? j : null;
  const departure = Math.max(now, Date.parse(j.departureAt));
  return {
    ...j,
    departureAt: new Date(departure).toISOString(),
    destinationArrivalAt: new Date(departure + j.seconds * 1000).toISOString(),
  };
}
export function buildJourneys(input: {
  from: LocatedPlace;
  to: LocatedPlace;
  paths: WalkingPath[];
  stops: Stop[];
  routes: Route[];
  trips: Trip[];
  stopTimes: StopTime[];
  arrivals: Arrival[];
  services?: Tables<"transit_services">[];
  frequencyTrips?: Set<string>;
  connected: boolean;
  walkingSpeed: number;
  bufferSeconds: number;
  now?: number;
  deadline?: string | null;
}): Journey[] {
  const now = input.now ?? Date.now();
  const { walkingSpeed, bufferSeconds } = input;
  if (
    !Number.isFinite(now) ||
    walkingSpeed < 0.7 ||
    walkingSpeed > 2.2 ||
    bufferSeconds < 0 ||
    bufferSeconds > 1800
  )
    return [];
  const paths = input.paths.filter((p) => Date.parse(p.expiresAt) > now);
  const path = (a: string, b: string) =>
    paths.find((p) => p.originId === a && p.destinationId === b);
  const walkSeconds = (p: WalkingPath) =>
    Math.ceil((p.seconds * 1.34) / walkingSpeed);
  const direct = path(input.from.id, input.to.id),
    journeys: Journey[] = [];
  const future =
    !!input.deadline && Date.parse(input.deadline) - now > 30 * 60000;
  if (direct) {
    const seconds = walkSeconds(direct);
    const depart = input.deadline
      ? Math.max(
          now,
          Date.parse(input.deadline) - bufferSeconds * 1000 - seconds * 1000,
        )
      : now;
    journeys.push({
      id: "walk",
      mode: "walk",
      label: "Walk directly",
      departureAt: new Date(depart).toISOString(),
      destinationArrivalAt: new Date(depart + seconds * 1000).toISOString(),
      walkingSeconds: seconds,
      boardingBufferSeconds: 0,
      support: { kind: "walking", verified: true },
      seconds,
      meters: direct.meters,
      legs: [
        {
          kind: "walk",
          label: `Walk to ${input.to.name}`,
          seconds,
          path: direct,
        },
      ],
      verifiedUntil: direct.expiresAt,
    });
  }
  for (const trip of input.trips.filter((t) => t.active)) {
    const route = input.routes.find((r) => r.id === trip.route_id);
    if (!route) continue;
    const times = input.stopTimes
      .filter((t) => t.trip_id === trip.id)
      .sort((a, b) => a.stop_sequence - b.stop_sequence);
    for (const b of times)
      for (const a of times) {
        if (
          b.stop_sequence >= a.stop_sequence ||
          b.pickup_type === 1 ||
          a.drop_off_type === 1
        )
          continue;
        const board = input.stops.find((s) => s.id === b.stop_id),
          alight = input.stops.find((s) => s.id === a.stop_id);
        const first = path(input.from.id, b.stop_id),
          last = path(a.stop_id, input.to.id);
        if (!board || !alight || !first || !last) continue;
        const walkTo = walkSeconds(first),
          walkFrom = walkSeconds(last);
        const add = (
          start: number,
          boardAt: number,
          exitAt: number,
          support: JourneyCandidate["support"],
          key: string,
          validUntil: string,
          extra: Partial<Journey> = {},
        ) => {
          if (
            ![start, boardAt, exitAt].every(Number.isFinite) ||
            start < now ||
            boardAt < start + (walkTo + bufferSeconds) * 1000 ||
            exitAt <= boardAt
          )
            return;
          const wait = (boardAt - start) / 1000 - walkTo,
            ride = (exitAt - boardAt) / 1000;
          const seconds = walkTo + wait + ride + walkFrom;
          journeys.push({
            id: key,
            mode: "bus",
            label: route.long_name,
            departureAt: new Date(start).toISOString(),
            destinationArrivalAt: new Date(
              exitAt + walkFrom * 1000,
            ).toISOString(),
            walkingSeconds: walkTo + walkFrom,
            boardingBufferSeconds: bufferSeconds,
            support,
            seconds,
            meters: first.meters + last.meters,
            route,
            headsign: trip.headsign ?? alight.name,
            board,
            alight,
            tripId: trip.id,
            boardingSequence: b.stop_sequence,
            alightingSequence: a.stop_sequence,
            verifiedUntil: validUntil,
            legs: [
              {
                kind: "walk",
                label: `Walk to ${board.name}`,
                seconds: walkTo,
                path: first,
              },
              { kind: "wait", label: `Wait at ${board.name}`, seconds: wait },
              {
                kind: "ride",
                label: `Take ${route.long_name} toward ${trip.headsign || alight.name}. Exit at ${alight.name}.`,
                seconds: ride,
              },
              {
                kind: "walk",
                label: `Walk to ${input.to.name}`,
                seconds: walkFrom,
                path: last,
              },
            ],
            ...extra,
          });
        };
        if (!future && input.connected) {
          for (const boardRow of input.arrivals.filter(
            (r) =>
              r.trip_id === trip.id &&
              r.stop_id === b.stop_id &&
              r.stop_sequence === b.stop_sequence,
          )) {
            const boarding = arrivalEstimate(boardRow, now, input.connected);
            if (boarding.state !== "valid") continue;
            const exitRow = input.arrivals.find(
              (r) =>
                r.trip_id === trip.id &&
                r.instance_key === boardRow.instance_key &&
                r.stop_id === a.stop_id &&
                r.stop_sequence === a.stop_sequence,
            );
            const exit = arrivalEstimate(exitRow ?? null, now, input.connected);
            if (exit.state !== "valid" || !exitRow) continue;
            const combined = calculatedArrival(
              exit.arrivalAt,
              [boarding, exit],
              now,
            );
            if (combined.state !== "valid" || !combined.validUntil) continue;
            const boardAt = Date.parse(
              boardRow.departure_at ?? boardRow.arrival_at ?? "",
            );
            if (boardAt < Date.parse(boardRow.arrival_at ?? "")) continue;
            add(
              now,
              boardAt,
              Date.parse(exit.arrivalAt!),
              { kind: "live", estimate: combined },
              `${boardRow.instance_key}:${b.stop_sequence}:${a.stop_sequence}`,
              combined.validUntil,
              {
                instanceKey: boardRow.instance_key,
                arrivalIds: [boardRow.id, exitRow.id],
              },
            );
          }
        }
        // A published timetable supports future trips; frequency templates alone do not.
        if (input.deadline && input.services) {
          const service = input.services.find((s) => s.id === trip.service_id);
          if (!service) continue;
          const target = Date.parse(input.deadline);
          for (const offset of [-86400000, 0, 86400000]) {
            const date = campusDate(target + offset).replaceAll("-", "");
            if (!operatesOn(service, date)) continue;
            const candidate = scheduledJourney({
              id: "schedule",
              date,
              service,
              trip,
              boarding: b,
              alighting: a,
              walkToSeconds: walkTo,
              walkFromSeconds: walkFrom,
              boardingBufferSeconds: bufferSeconds,
              verifiedWalking: true,
              frequencyTemplate: input.frequencyTrips?.has(trip.id) ?? false,
            });
            if (!candidate) continue;
            const start = Date.parse(candidate.departureAt),
              boardAt = start + (walkTo + bufferSeconds) * 1000,
              exitAt =
                Date.parse(candidate.destinationArrivalAt) - walkFrom * 1000;
            add(
              start,
              boardAt,
              exitAt,
              candidate.support,
              `schedule:${date}:${trip.id}:${b.stop_sequence}:${a.stop_sequence}`,
              new Date(
                Math.min(
                  Date.parse(first.expiresAt),
                  Date.parse(last.expiresAt),
                ),
              ).toISOString(),
            );
          }
        }
      }
  }
  const unique = [...new Map(journeys.map((j) => [j.id, j])).values()];
  return unique
    .sort((a, b) => {
      if (input.deadline) {
        const aa = assessDeadline(a, input.deadline, bufferSeconds, now),
          bb = assessDeadline(b, input.deadline, bufferSeconds, now);
        const rank = (s: string) =>
          s === "on_time" ? 0 : s === "tight" ? 1 : s === "likely_late" ? 2 : 3;
        return (
          rank(aa.status) - rank(bb.status) ||
          Date.parse(b.departureAt) - Date.parse(a.departureAt) ||
          a.seconds - b.seconds
        );
      }
      return (
        a.seconds - b.seconds ||
        a.walkingSeconds - b.walkingSeconds ||
        a.id.localeCompare(b.id)
      );
    })
    .slice(0, 12);
}
