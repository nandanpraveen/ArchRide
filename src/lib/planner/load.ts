import type { PlaceRef, TravelPreferences } from "@/lib/personal";
import { publicTransitClient } from "@/lib/supabase/public";
import { arrivalFeedConnected } from "@/lib/transit/contracts";
import type { PublicTransitData } from "@/lib/transit/public-data";
import { currentLocation } from "@/lib/location";
import {
  locate,
  walkingPath,
  type LocatedPlace,
  type WalkingPath,
} from "./walking";
import { buildJourneys, haversineMeters } from "./planner";

async function pages<T>(
  read: (offset: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const out: T[] = [];
  for (let offset = 0; offset < 5000; offset += 1000) {
    const r = await read(offset);
    if (r.error) throw new Error("Route details could not load. Try again.");
    out.push(...(r.data ?? []));
    if ((r.data?.length ?? 0) < 1000) return out;
  }
  throw new Error(
    "Too many route patterns to verify. Choose closer boarding stops.",
  );
}
export async function loadJourneys(input: {
  from: PlaceRef | null;
  to: PlaceRef;
  gps: boolean;
  preferences: TravelPreferences;
  transit: Pick<PublicTransitData, "routes" | "stops">;
  deadline: string | null;
  signal: AbortSignal;
}) {
  const { signal, transit } = input,
    db = publicTransitClient();
  if (!db) throw new Error("Campus data is unavailable.");
  const gps = input.gps ? currentLocation() : null;
  if (input.gps && !gps)
    throw new Error(
      "Share your current location again, or choose a starting building.",
    );
  const [from, to] = await Promise.all([
    gps
      ? Promise.resolve({
          id: "current-location",
          name: "Current location",
          type: "stop" as const,
          latitude: gps.latitude,
          longitude: gps.longitude,
        })
      : input.from
        ? locate(input.from, signal)
        : Promise.reject(new Error("Choose your starting point.")),
    locate(input.to, signal),
  ]);
  const closest = (p: LocatedPlace) =>
    transit.stops
      .filter((s) => s.active && s.location_type === 0)
      .map((s) => ({ s, d: haversineMeters(p, s) }))
      .filter((x) => x.d <= 1000)
      .sort((a, b) => a.d - b.d || a.s.id.localeCompare(b.s.id))
      .slice(0, 3)
      .map((x) => x.s);
  const boarding = closest(from),
    exits = closest(to),
    stopIds = [...new Set([...boarding, ...exits].map((s) => s.id))];
  const pairs: [LocatedPlace, LocatedPlace][] = [
    [from, to],
    ...boarding.map(
      (s) =>
        [from, { ...s, type: "stop" as const }] as [LocatedPlace, LocatedPlace],
    ),
    ...exits.map(
      (s) =>
        [{ ...s, type: "stop" as const }, to] as [LocatedPlace, LocatedPlace],
    ),
  ];
  const paths: WalkingPath[] = [],
    warnings: string[] = [];
  // The centrally limited routing endpoint protects the provider's one-request/second policy.
  for (const [a, b] of pairs) {
    signal.throwIfAborted();
    try {
      paths.push(await walkingPath(a, b, signal));
    } catch (e) {
      if (signal.aborted) throw e;
      warnings.push(
        e instanceof Error ? e.message : "A walking path is unavailable.",
      );
    }
  }
  if (!paths.length)
    return {
      from,
      to,
      journeys: [],
      warnings: [...new Set(warnings)],
      calculatedAt: Date.now(),
    };
  const stopTimes = stopIds.length
    ? await pages((offset) =>
        db
          .from("transit_stop_times")
          .select("*")
          .in("stop_id", stopIds)
          .order("id")
          .range(offset, offset + 999)
          .abortSignal(signal),
      )
    : [];
  const tripIds = [...new Set(stopTimes.map((s) => s.trip_id))];
  const trips = tripIds.length
    ? await db
        .from("transit_trips")
        .select("*")
        .in("id", tripIds)
        .eq("active", true)
        .order("id")
        .limit(1000)
        .abortSignal(signal)
    : { data: [], error: null };
  const now = Date.now();
  const [arrivals, services, frequencies] = await Promise.all([
    stopIds.length
      ? db
          .from("transit_arrivals")
          .select("*")
          .in("stop_id", stopIds)
          .gt("valid_until", new Date(now).toISOString())
          .gte("update_timestamp", new Date(now - 90000).toISOString())
          .order("id")
          .limit(1000)
          .abortSignal(signal)
      : Promise.resolve({ data: [], error: null }),
    input.deadline
      ? db
          .from("transit_services")
          .select("*")
          .order("id")
          .limit(1000)
          .abortSignal(signal)
      : Promise.resolve({ data: [], error: null }),
    input.deadline && tripIds.length
      ? db
          .from("transit_frequencies")
          .select("trip_id")
          .in("trip_id", tripIds)
          .order("id")
          .limit(1000)
          .abortSignal(signal)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const busUnavailable =
    trips.error ||
    arrivals.error ||
    services.error ||
    frequencies.error ||
    [trips.data, arrivals.data, services.data, frequencies.data].some(
      (r) => (r?.length ?? 0) >= 1000,
    );
  if (busUnavailable)
    warnings.push(
      "Bus options could not be verified. Walking directions remain available.",
    );
  const feed = await db
    .from("feed_status")
    .select("*")
    .eq("id", "uga-passio:arrivals")
    .abortSignal(signal)
    .maybeSingle();
  const clock = Date.now(),
    connected =
      !feed.error && arrivalFeedConnected(feed.data ?? undefined, clock);
  const journeys = buildJourneys({
    from,
    to,
    paths,
    stops: transit.stops,
    routes: transit.routes,
    trips: busUnavailable ? [] : (trips.data ?? []),
    stopTimes,
    arrivals: arrivals.data ?? [],
    services: services.data ?? [],
    frequencyTrips: new Set(frequencies.data?.map((f) => f.trip_id)),
    connected,
    walkingSpeed: input.preferences.walkingSpeed,
    bufferSeconds: input.preferences.buffer * 60,
    now: clock,
    deadline: input.deadline,
  });
  return {
    from,
    to,
    journeys,
    warnings: [...new Set(warnings)],
    calculatedAt: clock,
  };
}
