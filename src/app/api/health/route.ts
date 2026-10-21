import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { feedFreshness } from "@/lib/transit/contracts";
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const headers = { "Cache-Control": "no-store" };
  if (!url || !key)
    return Response.json(
      { app: "ArchRide", status: "unconfigured", transit: "not-connected" },
      { status: 503, headers },
    );
  const supabase = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(5000) }),
    },
  });
  const { data, error } = await supabase
    .from("feed_status")
    .select("*")
    .like("id", "uga-passio:%");
  const feeds =
    data?.map((feed) => ({
      id: feed.id,
      freshness: feedFreshness(feed),
      sourceTimestamp: feed.source_timestamp,
      lastSuccessAt: feed.last_success_at,
      entityCount: feed.entity_count,
    })) ?? [];
  const transit = !feeds.some((f) => f.lastSuccessAt)
    ? "not-connected"
    : feeds.length === 4 && feeds.every((f) => f.freshness === "current")
      ? "connected"
      : "degraded";
  return Response.json(
    {
      app: "ArchRide",
      status: error ? "degraded" : "ok",
      database: error ? "unavailable" : "connected",
      transit,
      feeds,
    },
    { status: error ? 503 : 200, headers },
  );
}
