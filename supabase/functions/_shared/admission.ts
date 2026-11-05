import pg from "pg";
import { networkPrefix } from "./network.ts";
import { cors } from "./http.ts";
let inFlight = 0;
export async function networkKey(request: Request) {
  // Hosted *.supabase.co is behind Cloudflare. Its injected header was verified
  // against spoofed XFF/X-Real-IP and direct CF header injection on this project.
  // Never fall back to client-provided bucket IDs, cookies, or forwarding chains.
  const network = networkPrefix(request.headers.get("cf-connecting-ip")), salt = Deno.env.get("ARCHRIDE_RATE_SALT");
  if (!network || !salt || salt.length < 32) return null;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(salt), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(new Date().toISOString().slice(0, 10) + ":" + network));
  return Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, "0")).join("");
}
export function databaseClient(application: string) {
  return new pg.Client({ connectionString: Deno.env.get("SUPABASE_DB_URL"), connectionTimeoutMillis: 3000, statement_timeout: 5000, application_name: application });
}
export async function admit(request: Request, scope: "read" | "walking" | "report", db: pg.Client) {
  const headers = cors(request);
  if (inFlight >= 12) return { response: Response.json({ error: "service_busy" }, { status: 429, headers: { ...headers, "retry-after": "1" } }), release: async () => {} };
  const hash = await networkKey(request);
  if (!hash) return { response: Response.json({ error: "network_verification_unavailable" }, { status: 503, headers: { ...headers, "retry-after": "5" } }), release: async () => {} };
  inFlight++;
  let lease: string | null = null;
  const release = async () => { if (lease) await db.query("delete from archride_private.request_leases where id=$1", [lease]).catch(() => {}); inFlight--; };
  try {
    await db.connect();
    const result = await db.query("select * from archride_private.admit_public_request($1,$2)", [scope, hash]);
    const row = result.rows[0];
    if (!row?.allowed) {
      await release();
      return { response: Response.json({ error: "rate_limited", retryAfter: row?.retry_after ?? 1 }, { status: 429, headers: { ...headers, "retry-after": String(row?.retry_after ?? 1) } }), release: async () => {} };
    }
    lease = row.lease_id;
    return { response: null, release };
  } catch (error) { await release(); throw error; }
}
