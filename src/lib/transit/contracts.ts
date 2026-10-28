import { arrivalEstimate, ESTIMATE_MAX_AGE_MS } from "./estimates";
import type { Tables } from "@/lib/supabase/database.types";
export type Route = Tables<"transit_routes">;
export type Stop = Tables<"transit_stops">;
export type Vehicle = Tables<"transit_vehicles">;
export type Arrival = Tables<"transit_arrivals">;
export type FeedHealth = Tables<"feed_status">;
export function activeTransitAlerts(alerts: Tables<"transit_alerts">[], now = Date.now()) {
  return alerts.filter((alert) => {
    if (!alert.active || !Array.isArray(alert.active_periods)) return false;
    if (!alert.active_periods.length) return true;
    return alert.active_periods.some((period) => {
      if (!period || typeof period !== "object" || Array.isArray(period)) return false;
      const { start, end } = period;
      if (start != null && (typeof start !== "number" || !Number.isFinite(start))) return false;
      if (end != null && (typeof end !== "number" || !Number.isFinite(end))) return false;
      return (start == null || start * 1000 <= now) && (end == null || now < end * 1000);
    });
  });
}
export const REALTIME_STALE_SECONDS = ESTIMATE_MAX_AGE_MS / 1000;
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
  return arrivalEstimate(arrival, now).state === "valid";
}
