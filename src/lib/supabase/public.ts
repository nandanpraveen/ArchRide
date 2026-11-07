import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { authClient, sessionExpired } from "./auth";
let client: SupabaseClient<Database> | null = null;
let cooldownUntil = 0;
/** Signed-in reads still pass through server admission; direct Data API grants stay closed. */
export function publicTransitClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  client ??= createClient<Database>(url, key, {
    accessToken: async () => (await authClient()?.auth.getSession())?.data.session?.access_token ?? null,
    global: { fetch: async (input, init) => {
      const request = new Request(input, init), target = new URL(request.url);
      if (!target.pathname.startsWith("/rest/v1/")) {
        const response = await fetch(request);
        if (response.status === 401) sessionExpired();
        return response;
      }
      if (!["GET", "HEAD"].includes(request.method)) return Response.json({ message: "Campus data is read-only." }, { status: 405 });
      if (Date.now() < cooldownUntil) return Response.json({ message: "Campus data is busy. The last loaded information remains available." }, { status: 429, headers: { "retry-after": String(Math.max(1, Math.ceil((cooldownUntil - Date.now()) / 1000))) } });
      const proxy = new URL("/functions/v1/public-read", url);
      proxy.searchParams.set("path", target.pathname + target.search);
      if (request.headers.get("accept")?.includes("application/vnd.pgrst.object")) proxy.searchParams.set("single", "true");
      const authorization = request.headers.get("authorization");
      const send = () => fetch(proxy, { method: request.method, headers: { apikey: key, ...(authorization ? { Authorization: authorization } : {}) }, signal: request.signal });
      let response = await send();
      // A brief concurrency burst should recover without losing the campus search.
      // Retry once only for a one-second wait; longer quota limits keep the cooldown UI.
      if (response.status === 429 && Number(response.headers.get("retry-after")) === 1) {
        await response.body?.cancel();
        await new Promise(resolve => setTimeout(resolve, 1000));
        request.signal.throwIfAborted();
        response = await send();
      }
      if (response.status === 401) sessionExpired();
      if (response.status === 429) {
        const retry = Number(response.headers.get("retry-after"));
        cooldownUntil = Date.now() + (Number.isFinite(retry) && retry > 0 ? Math.min(retry, 3600) : 5) * 1000;
      }
      return response;
    } },
  });
  return client;
}
