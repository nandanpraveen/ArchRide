import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  REALTIME_STALE_SECONDS,
  usableArrival,
  type Arrival,
} from "./contracts";
type Client = SupabaseClient<Database>;
// All reads use the caller's public/session client. Never construct a service client here.
export async function readStopArrivals(
  db: Client,
  stopId: string,
  now = Date.now(),
  signal?: AbortSignal,
) {
  const boundedSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
    : AbortSignal.timeout(10_000);
  const result = await db
    .from("transit_arrivals")
    .select("*")
    .eq("stop_id", stopId)
    .eq("relationship", "SCHEDULED")
    .eq("provenance", "source")
    .gte("arrival_at", new Date(now).toISOString())
    .gt("valid_until", new Date(now).toISOString())
    .gte(
      "update_timestamp",
      new Date(now - REALTIME_STALE_SECONDS * 1000).toISOString(),
    )
    .lte("update_timestamp", new Date(now + 120_000).toISOString())
    .order("arrival_at")
    .order("id")
    .limit(3)
    .abortSignal(boundedSignal);
  return {
    ...result,
    data: result.data?.filter((a) => usableArrival(a, now)) || null,
  };
}

export type HomeDeparture = Arrival & {
  headsign: string | null;
  direction_id: number | null;
};
export type HomeStopDepartures = {
  stopId: string;
  arrivals: HomeDeparture[];
  error: boolean;
};

export async function readHomeDepartures(
  db: Client,
  stopIds: string[],
  now = Date.now(),
  signal?: AbortSignal,
): Promise<HomeStopDepartures[]> {
  const boundedSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
    : AbortSignal.timeout(10_000);
  const stops = [...new Set(stopIds.filter(Boolean))].slice(0, 3);
  const results = await Promise.all(
    stops.map(async (stopId) => {
      try {
        const result = await readStopArrivals(db, stopId, now, boundedSignal);
        return { stopId, arrivals: result.data ?? [], error: !!result.error };
      } catch {
        return { stopId, arrivals: [], error: true };
      }
    }),
  );
  const tripIds = [
    ...new Set(
      results.flatMap((result) =>
        result.arrivals.map((arrival) => arrival.trip_id),
      ),
    ),
  ];
  const trips = tripIds.length
    ? await db
        .from("transit_trips")
        .select("id,route_id,headsign,direction_id")
        .in("id", tripIds)
        .eq("active", true)
        .limit(10)
        .abortSignal(boundedSignal)
    : { data: [], error: null };
  return results.map((result) => ({
    ...result,
    error: result.error || (result.arrivals.length > 0 && !!trips.error),
    arrivals: result.arrivals.map((arrival) => {
      const trip = trips.data?.find(
        (candidate) =>
          candidate.id === arrival.trip_id &&
          candidate.route_id === arrival.route_id,
      );
      return {
        ...arrival,
        headsign: trip?.headsign ?? null,
        direction_id: trip?.direction_id ?? null,
      };
    }),
  }));
}
