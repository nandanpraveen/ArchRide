import { publicTransitClient } from "./supabase/public";
import { isPublicBoardingStop } from "./transit/contracts";

// Drop-in implementation of the contract already used on task-1-home.
export type PlaceType = "building" | "entrance" | "stop";
export type Place = {
  id: string;
  name: string;
  type: PlaceType;
  locationLabel: string;
  aliases?: string[];
  latitude?: number;
  longitude?: number;
};
export type SearchResult =
  | {
      status: "ok";
      places: Place[];
      updatedAt: string | null;
      warning?: string;
    }
  | { status: "unavailable"; reason: string };
const normalize = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ");
export function matchPlaces(places: Place[], query: string): Place[] {
  const words = normalize(query).split(" ").filter(Boolean);
  if (!words.length) return [];
  const wordMatches = (place: Place) => words.filter((word) =>
    [place.name, ...(place.aliases || [])].some((name) =>
      normalize(name).split(/[\s—-]+/).some((part) => part.startsWith(word)),
    ),
  ).length;
  return places
    .filter((p) =>
      (p.type !== "stop" || isPublicBoardingStop(p)) && words.every((word) =>
        [p.name, ...(p.aliases || [])].some((name) =>
          normalize(name).includes(word),
        ),
      ),
    )
    .sort(
      (a, b) =>
        wordMatches(b) - wordMatches(a) ||
        a.name.localeCompare(b.name) ||
        a.type.localeCompare(b.type) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 30);
}
async function catalogRows<T>(
  page: (offset: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const rows: T[] = [];
  for (let offset = 0; offset < 10_000; offset += 1000) {
    const result = await page(offset);
    if (result.error) return { data: null, error: true };
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 1000) return { data: rows, error: false };
  }
  return { data: null, error: true };
}

export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
): Promise<SearchResult> {
  if (!query.trim()) return { status: "ok", places: [], updatedAt: null };
  const db = publicTransitClient();
  if (!db)
    return {
      status: "unavailable",
      reason: "Campus location data is not connected yet.",
    };
  const abort = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
    : AbortSignal.timeout(10_000);
  try {
    const [stops, buildings, entrances, health] = await Promise.all([
      catalogRows((offset) =>
        db
          .from("transit_stops")
          .select("id,name,latitude,longitude")
          .eq("active", true)
          .order("id")
          .range(offset, offset + 999)
          .abortSignal(abort),
      ),
      catalogRows((offset) =>
        db
          .from("transit_buildings")
          .select("id,name,aliases,latitude,longitude")
          .order("id")
          .range(offset, offset + 999)
          .abortSignal(abort),
      ),
      catalogRows((offset) =>
        db
          .from("transit_entrances")
          .select("id,name,building_id,latitude,longitude")
          .order("id")
          .range(offset, offset + 999)
          .abortSignal(abort),
      ),
      db
        .from("feed_status")
        .select("last_success_at")
        .eq("id", "uga-passio:static")
        .abortSignal(abort)
        .maybeSingle(),
    ]);
    if ([stops, buildings, entrances].every((r) => r.error))
      return {
        status: "unavailable",
        reason:
          "Campus location data is temporarily unavailable. Please try again.",
      };
    const names = new Map((buildings.data || []).map((b) => [b.id, b.name]));
    const places: Place[] = [
      ...(stops.data || []).map((s) => ({
        ...s,
        type: "stop" as const,
        locationLabel: `UGA bus stop · ${s.latitude.toFixed(5)}, ${s.longitude.toFixed(5)}`,
      })),
      ...(buildings.data || []).map((b) => ({
        ...b,
        type: "building" as const,
        locationLabel: `Verified campus building · ${b.latitude.toFixed(5)}, ${b.longitude.toFixed(5)}`,
      })),
      ...(entrances.data || []).map((e) => ({
        ...e,
        type: "entrance" as const,
        locationLabel: `${names.get(e.building_id) || "Verified campus entrance"} · ${e.latitude.toFixed(5)}, ${e.longitude.toFixed(5)}`,
      })),
    ];
    return {
      status: "ok",
      places: matchPlaces(places, query),
      updatedAt: health.data?.last_success_at ?? null,
      ...([stops, buildings, entrances].some((result) => result.error)
        ? {
            warning:
              "Some campus locations could not load. These search results may be incomplete.",
          }
        : {}),
    };
  } catch {
    return {
      status: "unavailable",
      reason: signal?.aborted
        ? "Search canceled."
        : "Campus location data is temporarily unavailable. Please try again.",
    };
  }
}
// Returns the building ids that no longer exist, or null when the catalog could not be checked.
export async function findMissingBuildings(
  ids: string[],
  signal?: AbortSignal,
): Promise<Set<string> | null> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Set();
  const db = publicTransitClient();
  if (!db) return null;
  const abort = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
    : AbortSignal.timeout(10_000);
  try {
    const { data, error } = await db
      .from("transit_buildings")
      .select("id")
      .in("id", unique)
      .abortSignal(abort);
    if (error || !data) return null;
    const found = new Set(data.map((row) => row.id));
    return new Set(unique.filter((id) => !found.has(id)));
  } catch {
    return null;
  }
}
