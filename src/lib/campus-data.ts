import { createClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";

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
  | { status: "ok"; places: Place[]; updatedAt: string | null }
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
  return places
    .filter((p) =>
      words.every((word) =>
        [p.name, ...(p.aliases || [])].some((name) =>
          normalize(name).includes(word),
        ),
      ),
    )
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name) ||
        a.type.localeCompare(b.type) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 30);
}
export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
): Promise<SearchResult> {
  if (!query.trim()) return { status: "ok", places: [], updatedAt: null };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    return {
      status: "unavailable",
      reason: "Campus location data is not connected yet.",
    };
  const db = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const abort = signal || new AbortController().signal;
  try {
    const [stops, buildings, entrances, health] = await Promise.all([
      db
        .from("transit_stops")
        .select("id,name,latitude,longitude")
        .eq("active", true)
        .order("id")
        .limit(1000)
        .abortSignal(abort),
      db
        .from("transit_buildings")
        .select("id,name,aliases,latitude,longitude")
        .order("id")
        .limit(1000)
        .abortSignal(abort),
      db
        .from("transit_entrances")
        .select("id,name,building_id,latitude,longitude")
        .order("id")
        .limit(1000)
        .abortSignal(abort),
      db
        .from("feed_status")
        .select("last_success_at")
        .eq("id", "uga-passio:static")
        .abortSignal(abort)
        .maybeSingle(),
    ]);
    if (
      [stops, buildings, entrances, health].some((r) => r.error) ||
      !health.data?.last_success_at
    )
      return {
        status: "unavailable",
        reason:
          "Campus location data is temporarily unavailable. Please try again.",
      };
    // Fail explicitly if a future catalog exceeds this contract's current bound; never silently omit matches.
    if ([stops, buildings, entrances].some((r) => r.data?.length === 1000))
      return {
        status: "unavailable",
        reason: "The campus catalog needs an updated search index.",
      };
    const names = new Map((buildings.data || []).map((b) => [b.id, b.name]));
    const places: Place[] = [
      ...(stops.data || []).map((s) => ({
        ...s,
        type: "stop" as const,
        locationLabel: "UGA bus stop",
      })),
      ...(buildings.data || []).map((b) => ({
        ...b,
        type: "building" as const,
        locationLabel: "Verified campus building",
      })),
      ...(entrances.data || []).map((e) => ({
        ...e,
        type: "entrance" as const,
        locationLabel: names.get(e.building_id) || "Verified campus entrance",
      })),
    ];
    return {
      status: "ok",
      places: matchPlaces(places, query),
      updatedAt: health.data.last_success_at,
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
