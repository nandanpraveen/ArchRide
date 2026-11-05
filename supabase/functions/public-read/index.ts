import { admit, databaseClient } from "../_shared/admission.ts";
import { cors, guard } from "../_shared/http.ts";
import { publicQuery } from "./validation.ts";
const cache = new Map<string, { body: string; until: number; status: number; contentRange: string | null }>();
Deno.serve(async (request: Request) => {
  const headers = cors(request);
  const early = guard(request, ["GET", "HEAD"]); if (early) return early;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (!["GET", "HEAD"].includes(request.method)) return Response.json({ error: "read_only" }, { status: 405, headers });
  const url = new URL(request.url);
  if (url.search.length > 16000) return Response.json({ error: "query_too_large" }, { status: 413, headers });
  const query = publicQuery(url.searchParams.get("path"));
  if (!query || [...url.searchParams.keys()].some(k => !["path", "single"].includes(k))) return Response.json({ error: "unsupported_public_query" }, { status: 400, headers });
  const single = url.searchParams.get("single") === "true", cacheKey = query.path + `:single=${single}`, db = databaseClient("archride-public-read");
  let release = async () => {};
  try {
    const admission = await admit(request, "read", db); release = admission.release;
    if (admission.response) return admission.response;
    const existing = cache.get(cacheKey);
    if (existing && existing.until > Date.now()) return new Response(request.method === "HEAD" ? null : existing.body, { status: existing.status, headers: { ...headers, "content-type": "application/json", ...(existing.contentRange ? { "content-range": existing.contentRange } : {}), "x-archride-cache": "HIT" } });
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // Only the fixed table/column/operator allowlist is forwarded. Caller auth,
    // schema, Prefer, URL, method and relation embeddings are never forwarded.
    const response = await fetch(Deno.env.get("SUPABASE_URL")! + query.path, { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: single ? "application/vnd.pgrst.object+json" : "application/json" }, signal: AbortSignal.timeout(8000) });
    const body = await response.text();
    if (body.length > 2_000_000) return Response.json({ error: "public_result_too_large" }, { status: 413, headers });
    const contentRange = response.headers.get("content-range");
    if (response.ok && body.length <= 128000) {
      cache.delete(cacheKey);
      for (const [key, entry] of cache) if (entry.until <= Date.now()) cache.delete(key);
      if (cache.size >= 64) cache.delete(cache.keys().next().value!);
      cache.set(cacheKey, { body, until: Date.now() + query.ttl, status: response.status, contentRange });
    }
    return new Response(request.method === "HEAD" ? null : body, { status: response.status, headers: { ...headers, "content-type": "application/json", ...(contentRange ? { "content-range": contentRange } : {}), "x-archride-cache": "MISS" } });
  } catch { return Response.json({ error: "public_data_unavailable" }, { status: 503, headers: { ...headers, "retry-after": "5" } }); }
  finally { await release(); await db.end().catch(() => {}); }
});
