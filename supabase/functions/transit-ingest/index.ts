import pg from "pg";
import { runIngestion } from "./core.js";

// JWT gateway is disabled because this endpoint authenticates a dedicated job token.
// Ordinary Supabase JWTs/publishable keys do not authorize ingestion.
Deno.serve(async (request: Request) => {
  if (request.method !== "POST")
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  const bearer = request.headers
    .get("authorization")
    ?.match(/^Bearer ([A-Za-z0-9_-]{32,256})$/)?.[1];
  if (!bearer) return Response.json({ error: "unauthorized" }, { status: 401 });
  const db = new pg.Client({
    connectionString: Deno.env.get("SUPABASE_DB_URL"),
    connectionTimeoutMillis: 10000,
    statement_timeout: 45000,
    application_name: "archride-edge-transit",
  });
  try {
    await db.connect();
    const bytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(bearer),
    );
    const hash = Array.from(new Uint8Array(bytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const allowed = await db.query(
      "select token_hash=$1 as allowed from archride_private.transit_job_config where id",
      [hash],
    );
    if (!allowed.rows[0]?.allowed)
      return Response.json({ error: "unauthorized" }, { status: 401 });
    const payload = await request.json().catch(() => null);
    if (!payload || !["all", "static"].includes(payload.mode))
      return Response.json({ error: "invalid_mode" }, { status: 400 });
    const result = await runIngestion(
      db,
      payload.mode,
      payload.verifyReplay === true,
    );
    return Response.json(result, { status: result.failed ? 503 : 200 });
  } catch {
    console.error(
      JSON.stringify({ outcome: "failed", code: "edge_worker_failed" }),
    );
    return Response.json({ error: "worker_failed" }, { status: 503 });
  } finally {
    await db.end().catch(() => {});
  }
});
