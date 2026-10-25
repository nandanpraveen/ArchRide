import type { Tables } from "../supabase/database.types";
import { campusDeadline, type JourneyCandidate } from "./deadlines";
type Service = Tables<"transit_services">;
type StopTime = Tables<"transit_stop_times">;
/** GTFS service dates and exception types are evaluated in agency time. */
export function operatesOn(service: Service, date: string): boolean {
  if (!/^\d{8}$/.test(date)) return false;
  const day = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`;
  if (!campusDeadline(`${day}T12:00`)) return false;
  const exceptions = Array.isArray(service.exceptions)
    ? service.exceptions
    : [];
  const exception = exceptions.find(
    (e) => e && typeof e === "object" && !Array.isArray(e) && e.date === date,
  );
  if (exception && typeof exception === "object" && !Array.isArray(exception))
    return String(exception.exception_type) === "1";
  const calendar = service.calendar;
  if (!calendar || typeof calendar !== "object" || Array.isArray(calendar))
    return false;
  if (
    typeof calendar.start_date !== "string" ||
    typeof calendar.end_date !== "string" ||
    date < calendar.start_date ||
    date > calendar.end_date
  )
    return false;
  const weekday = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ][new Date(`${day}T12:00:00Z`).getUTCDay()];
  return String(calendar[weekday]) === "1";
}
/** GTFS times are elapsed seconds from local noon minus 12h (including >24h). */
export function serviceInstant(date: string, seconds: number): string | null {
  if (!/^\d{8}$/.test(date) || !Number.isFinite(seconds) || seconds < 0)
    return null;
  const noon = campusDeadline(
    `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}T12:00`,
  );
  return noon
    ? new Date(Date.parse(noon) + (seconds - 43200) * 1000).toISOString()
    : null;
}
/** Adapter over task-5's selected direct pattern and verified walking legs.
 * Frequency templates require materialized exact departures upstream. */
export function scheduledJourney(input: {
  id: string;
  date: string;
  service: Service;
  boarding: StopTime;
  alighting: StopTime;
  walkToSeconds: number;
  walkFromSeconds: number;
  boardingBufferSeconds: number;
  verifiedWalking: boolean;
  frequencyTemplate: boolean;
}): JourneyCandidate | null {
  const { boarding: b, alighting: a } = input;
  if (
    !input.verifiedWalking ||
    input.frequencyTemplate ||
    !operatesOn(input.service, input.date) ||
    b.trip_id !== a.trip_id ||
    b.stop_sequence >= a.stop_sequence ||
    b.pickup_type === 1 ||
    a.drop_off_type === 1 ||
    b.departure_seconds === null ||
    a.arrival_seconds === null ||
    a.arrival_seconds < b.departure_seconds ||
    ![
      input.walkToSeconds,
      input.walkFromSeconds,
      input.boardingBufferSeconds,
    ].every((n) => Number.isFinite(n) && n >= 0)
  )
    return null;
  const bus = serviceInstant(input.date, b.departure_seconds),
    arrival = serviceInstant(input.date, a.arrival_seconds);
  if (!bus || !arrival) return null;
  return {
    id: input.id,
    departureAt: new Date(
      Date.parse(bus) -
        (input.walkToSeconds + input.boardingBufferSeconds) * 1000,
    ).toISOString(),
    destinationArrivalAt: new Date(
      Date.parse(arrival) + input.walkFromSeconds * 1000,
    ).toISOString(),
    walkingSeconds: input.walkToSeconds + input.walkFromSeconds,
    boardingBufferSeconds: input.boardingBufferSeconds,
    support: { kind: "schedule", serviceDate: input.date, verified: true },
  };
}
