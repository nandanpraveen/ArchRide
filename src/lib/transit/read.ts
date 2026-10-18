import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { usableArrival } from "./contracts";
type Client = SupabaseClient<Database>;
// All reads use the caller's public/session client. Never construct a service client here.
export const readRoutes = (db: Client) =>
  db.from("transit_routes").select("*").eq("active", true).order("long_name");
export const readStops = (db: Client) =>
  db.from("transit_stops").select("*").eq("active", true).order("name");
export const readVehicles = (db: Client) =>
  db.from("transit_vehicles").select("*");
export const readFeedHealth = (db: Client) =>
  db.from("feed_status").select("*").like("id", "uga-passio:%");
export async function readStopArrivals(
  db: Client,
  stopId: string,
  now = Date.now(),
) {
  const result = await db
    .from("transit_arrivals")
    .select("*")
    .eq("stop_id", stopId)
    .eq("relationship", "SCHEDULED")
    .gte("arrival_at", new Date(now).toISOString())
    .gt("valid_until", new Date(now).toISOString())
    .gte("update_timestamp", new Date(now - 180_000).toISOString())
    .order("arrival_at")
    .limit(3);
  return {
    ...result,
    data: result.data?.filter((a) => usableArrival(a, now)) || null,
  };
}
