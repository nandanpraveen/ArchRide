import type { Tables } from "@/lib/supabase/database.types";
export type Route = Tables<"transit_routes">;
export type Stop = Tables<"transit_stops">;
export type Vehicle = Tables<"transit_vehicles">;
export type Arrival = Tables<"transit_arrivals">;
export type FeedHealth = Tables<"feed_status">;
export const REALTIME_STALE_SECONDS = 180;
export const STATIC_STALE_SECONDS = 48 * 60 * 60;
export type Freshness = "current" | "stale" | "unavailable";
export function freshness(
  timestamp: string | null,
  maxAge = REALTIME_STALE_SECONDS,
  now = Date.now(),
): Freshness {
  if (!timestamp) return "unavailable";
  const age = now - Date.parse(timestamp);
  return !Number.isFinite(age) || age < -120_000 || age > maxAge * 1000
    ? "stale"
    : "current";
}
export function feedFreshness(feed: FeedHealth, now = Date.now()): Freshness {
  if (!feed.last_success_at) return "unavailable";
  if (feed.state !== "healthy") return "stale";
  return feed.id.endsWith(":static")
    ? freshness(feed.last_success_at, STATIC_STALE_SECONDS, now)
    : freshness(feed.source_timestamp, REALTIME_STALE_SECONDS, now);
}
// Consumers must assess the observation clock, not the time the HTTP response was fetched.
export function vehicleFreshness(
  vehicle: Vehicle,
  now = Date.now(),
): Freshness {
  return freshness(vehicle.position_timestamp, REALTIME_STALE_SECONDS, now);
}
export function usableArrival(arrival: Arrival, now = Date.now()): boolean {
  return (
    arrival.relationship === "SCHEDULED" &&
    arrival.provenance === "source" &&
    !!arrival.arrival_at &&
    Date.parse(arrival.arrival_at) >= now &&
    Date.parse(arrival.valid_until) > now &&
    freshness(arrival.update_timestamp, REALTIME_STALE_SECONDS, now) ===
      "current"
  );
}
