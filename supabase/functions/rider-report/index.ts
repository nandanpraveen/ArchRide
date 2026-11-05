import { admit, databaseClient } from "../_shared/admission.ts";
import { cors, guard } from "../_shared/http.ts";
Deno.serve(async (request: Request) => {
  const early = guard(request); if (early) return early;
  const headers = cors(request), db = databaseClient("archride-anonymous-report");
  let release = async () => {};
  try {
    const raw = await request.text(); if (raw.length > 2048) return Response.json({ error: "request_too_large" }, { status: 413, headers });
    let body; try { body = JSON.parse(raw); } catch { return Response.json({ error: "invalid_report" }, { status: 400, headers }); }
    if (!body || body.consent !== true || typeof body.arrivalId !== "string" || !body.arrivalId.length || body.arrivalId.length > 200 || !["arrival", "boarding", "departure"].includes(body.eventKind) || typeof body.eventAt !== "string" || !Number.isFinite(Date.parse(body.eventAt)) || Date.parse(body.eventAt) > Date.now() + 15000 || Date.parse(body.eventAt) < Date.now() - 3600000 || Object.keys(body).some(k => !["consent", "arrivalId", "eventKind", "eventAt"].includes(k))) return Response.json({ error: "invalid_report" }, { status: 400, headers });
    const admission = await admit(request, "report", db); release = admission.release; if (admission.response) return admission.response;
    const result = await db.query("select * from archride_private.submit_anonymous_report($1,$2,$3)", [body.arrivalId, body.eventKind, body.eventAt]);
    return Response.json(result.rows[0], { headers });
  } catch { return Response.json({ error: "report_unavailable" }, { status: 503, headers }); }
  finally { await release(); await db.end().catch(() => {}); }
});
