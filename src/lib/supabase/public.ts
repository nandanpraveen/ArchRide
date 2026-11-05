import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
let client: SupabaseClient<Database> | null = null;
let cooldownUntil = 0;
/** Anonymous reads pass through the bounded server allowlist; direct Data API grants are closed. */
export function publicTransitClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  client ??= createClient<Database>(url, key, {
    accessToken: async () => null,
    global: { fetch: async (input, init) => {
      const request = new Request(input, init), target = new URL(request.url);
      if (!target.pathname.startsWith("/rest/v1/")) return fetch(request);
      if (!["GET", "HEAD"].includes(request.method)) return Response.json({ message: "Campus data is read-only." }, { status: 405 });
      if (Date.now() < cooldownUntil) return Response.json({ message: "Campus data is busy. The last loaded information remains available." }, { status: 429, headers: { "retry-after": String(Math.max(1, Math.ceil((cooldownUntil - Date.now()) / 1000))) } });
      const proxy = new URL("/functions/v1/public-read", url);
      proxy.searchParams.set("path", target.pathname + target.search);
      if (request.headers.get("accept")?.includes("application/vnd.pgrst.object")) proxy.searchParams.set("single", "true");
      const response = await fetch(proxy, { method: request.method, headers: { apikey: key }, signal: request.signal });
      if (response.status === 429) {
        const retry = Number(response.headers.get("retry-after"));
        cooldownUntil = Date.now() + (Number.isFinite(retry) && retry > 0 ? Math.min(retry, 3600) : 5) * 1000;
      }
      return response;
    } },
  });
  return client;
}
