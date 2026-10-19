export type PlaceType = "building" | "entrance" | "stop";

export type Place = {
  id: string;
  name: string;
  type: PlaceType;
  locationLabel: string;
  aliases?: string[];
};

export type SearchResult =
  | { status: "ok"; places: Place[]; updatedAt: string | null }
  | { status: "unavailable"; reason: string };

/**
 * Placeholder until task 2 publishes the real data contract.
 * When task 2 is ready, replace the body of this function only.
 */
export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
): Promise<SearchResult> {
  void query;
  void signal;
  return {
    status: "unavailable",
    reason: "Campus location data is not connected yet.",
  };
}
