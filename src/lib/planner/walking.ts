import { publicTransitClient } from "@/lib/supabase/public";
import type { PlaceRef } from "@/lib/personal";
export type LocatedPlace = PlaceRef & { latitude: number; longitude: number };
export type WalkingPath = {
  originId: string;
  destinationId: string;
  seconds: number;
  meters: number;
  coordinates: [number, number][];
  provider: string;
  fetchedAt: string;
  expiresAt: string;
};
const memory = new Map<string, WalkingPath>();
export function clearWalkingCache() { memory.clear(); }
export const inCampus = (p: Pick<LocatedPlace, "latitude" | "longitude">) =>
  Number.isFinite(p.latitude) &&
  Number.isFinite(p.longitude) &&
  p.latitude >= 33.88 &&
  p.latitude <= 34.02 &&
  p.longitude >= -83.46 &&
  p.longitude <= -83.29;
export function validWalkingPath(
  p: unknown,
  now = Date.now(),
): p is WalkingPath {
  if (!p || typeof p !== "object") return false;
  const w = p as WalkingPath;
  return (
    typeof w.originId === "string" &&
    typeof w.destinationId === "string" &&
    Number.isFinite(w.seconds) &&
    w.seconds >= 0 &&
    Number.isFinite(w.meters) &&
    w.meters >= 0 &&
    Array.isArray(w.coordinates) &&
    w.coordinates.length > 0 &&
    w.coordinates.every(
      (c) =>
        Array.isArray(c) &&
        c.length === 2 &&
        inCampus({ longitude: c[0], latitude: c[1] }),
    ) &&
    Date.parse(w.expiresAt) > now &&
    Number.isFinite(Date.parse(w.fetchedAt)) &&
    typeof w.provider === "string"
  );
}
export async function locate(
  ref: PlaceRef,
  signal: AbortSignal,
): Promise<LocatedPlace> {
  const db = publicTransitClient();
  if (!db) throw new Error("Campus places could not load.");
  const table =
    ref.type === "stop"
      ? "transit_stops"
      : ref.type === "entrance"
        ? "transit_entrances"
        : "transit_buildings";
  const { data, error } = await db
    .from(table)
    .select("id,name,latitude,longitude")
    .eq("id", ref.id)
    .abortSignal(signal)
    .maybeSingle();
  if (error || !data || !inCampus(data) || (ref.type === "stop" && !isPublicBoardingStop(data)))
    throw new Error(
      "A selected place is unavailable. Choose another campus location.",
    );
  return { ...data, type: ref.type };
}
export async function walkingPath(
  from: LocatedPlace,
  to: LocatedPlace,
  signal: AbortSignal,
): Promise<WalkingPath> {
  if (!inCampus(from) || !inCampus(to))
    throw new Error(
      "Trip planning is available in the UGA Athens campus area.",
    );
  if (from.id === to.id)
    return {
      originId: from.id,
      destinationId: to.id,
      seconds: 0,
      meters: 0,
      coordinates: [[from.longitude, from.latitude]],
      provider: "Same location",
      fetchedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    };
  const key = `${from.id}:${from.latitude}:${from.longitude}>${to.id}`;
  const cached = memory.get(key);
  if (validWalkingPath(cached)) return cached;
  const db = publicTransitClient();
  if (!db) throw new Error("Walking directions could not load.");
  if (from.id !== "current-location") {
    const result = await db
      .from("transit_walking_cache")
      .select("*")
      .eq("origin_id", from.id)
      .eq("destination_id", to.id)
      .eq("profile", "foot")
      .gt("expires_at", new Date().toISOString())
      .order("fetched_at", { ascending: false })
      .limit(1)
      .abortSignal(signal)
      .maybeSingle();
    const row = result.data;
    const path = row
      ? {
          originId: row.origin_id,
          destinationId: row.destination_id,
          seconds: row.duration_seconds,
          meters: row.distance_meters,
          coordinates: row.geometry,
          provider: row.provider,
          fetchedAt: row.fetched_at,
          expiresAt: row.expires_at,
        }
      : null;
    if (validWalkingPath(path)) {
      memory.set(key, path);
      return path;
    }
  }
  const body = {
    from:
      from.id === "current-location"
        ? { type: "gps", latitude: from.latitude, longitude: from.longitude }
        : { id: from.id, type: from.type },
    to: { id: to.id, type: to.type },
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    signal.throwIfAborted();
    const { data, error } = await db.functions.invoke("walking-route", {
      body,
      signal,
    });
    if (
      !error &&
      validWalkingPath(data) &&
      data.originId === from.id &&
      data.destinationId === to.id
    ) {
      memory.set(key, data);
      return data;
    }
    const status = (error as { context?: { status?: number } } | null)?.context
      ?.status;
    if (status !== 429 || attempt === 2) break;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 1100);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(signal.reason);
        },
        { once: true },
      );
    });
  }
  throw new Error(
    "Walking directions are temporarily unavailable. Open walking directions below or try again.",
  );
}
import { isPublicBoardingStop } from "@/lib/transit/contracts";
