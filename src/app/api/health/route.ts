import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
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
  const { error } = await supabase.from("feed_status").select("id").limit(1);
  return Response.json(
    {
      app: "ArchRide",
      status: error ? "degraded" : "ok",
      database: error ? "unavailable" : "connected",
      transit: "not-connected",
    },
    { status: error ? 503 : 200, headers },
  );
}
