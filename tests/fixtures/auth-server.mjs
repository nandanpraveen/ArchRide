// Local-only Supabase protocol fixture. It sends no email and never contacts a hosted service.
import { createServer } from "node:http";
import { createHmac, randomUUID } from "node:crypto";

const host = "127.0.0.1";
const port = 3101;
const base = `http://${host}:${port}`;
const sessions = new Map();
const refreshTokens = new Map();
const pending = new Map();
const events = [];

const userFor = (email, id = randomUUID()) => ({
  id, aud: "authenticated", role: "authenticated", email,
  app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {},
  identities: [], is_anonymous: false, created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(), email_confirmed_at: new Date().toISOString(),
});

function sessionFor(user) {
  const issued = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iss: `${base}/auth/v1`, aud: "authenticated", sub: user.id,
    role: "authenticated", email: user.email, iat: issued, exp: issued + 3600, session_id: randomUUID(),
  })).toString("base64url");
  const signature = createHmac("sha256", "local-fixture-only-not-a-project-secret").update(`${header}.${payload}`).digest("base64url");
  const session = { access_token: `${header}.${payload}.${signature}`, token_type: "bearer", expires_in: 3600,
    expires_at: issued + 3600, refresh_token: randomUUID(), user };
  sessions.set(session.access_token, session);
  refreshTokens.set(session.refresh_token, session);
  return session;
}

function send(response, status, data, extra = {}) {
  response.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "http://127.0.0.1:3100",
    "access-control-allow-credentials": "true", "access-control-allow-headers": "authorization,apikey,content-type,x-client-info,x-supabase-api-version,prefer,range,range-unit",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS", ...extra });
  response.end(JSON.stringify(data));
}

createServer(async (request, response) => {
  const url = new URL(request.url, base);
  if (request.method === "OPTIONS") { send(response, 204, null); return; }
  if (url.pathname === "/__ready") { send(response, 200, { fixture: "local-auth-ready" }); return; }
  if (url.pathname === "/__test/events") {
    send(response, 200, events.filter((event) => event.email === url.searchParams.get("email"))); return;
  }
  let body = {};
  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString();
    if (raw) body = JSON.parse(raw);
  } catch { send(response, 400, { msg: "Malformed fixture request" }); return; }
  const token = request.headers.authorization?.replace(/^Bearer /i, "");
  const session = sessions.get(token);
  const codeEmail = typeof body.auth_code === "string" && /^(confirmation|recovery):/.test(body.auth_code)
    ? body.auth_code.slice(body.auth_code.indexOf(":") + 1) : "";
  const email = String(body.email ?? session?.user.email ?? codeEmail ?? "").toLowerCase();
  const event = { path: url.pathname, method: request.method, email, grant: url.searchParams.get("grant_type"),
    hasCodeVerifier: typeof body.code_verifier === "string" && body.code_verifier.length > 0,
    hasPassword: typeof body.password === "string", hasCodeChallenge: typeof body.code_challenge === "string" };
  events.push(event);
  if (events.length > 2000) events.shift();

  if (url.pathname.startsWith("/rest/v1/")) { send(response, 200, []); return; }
  if (url.pathname === "/auth/v1/signup") {
    if (email.startsWith("rate+")) { send(response, 429, { msg: "Email rate limit exceeded", error_code: "over_email_send_rate_limit" }, { "retry-after": "1" }); return; }
    const user = userFor(email);
    if (email.startsWith("instant+")) { send(response, 200, sessionFor(user)); return; }
    pending.set(email, user);
    send(response, 200, { user: { ...user, email_confirmed_at: undefined }, session: null }); return;
  }
  if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
    if (email.startsWith("invalid+")) { send(response, 400, { error: "invalid_grant", error_code: "invalid_credentials", error_description: "Invalid login credentials" }); return; }
    if (email.startsWith("rate+")) { send(response, 429, { msg: "Too many requests", error_code: "over_request_rate_limit" }, { "retry-after": "1" }); return; }
    if (email.startsWith("unavailable+")) { send(response, 503, { msg: "Authentication is temporarily unavailable", error_code: "unexpected_failure" }); return; }
    if (email.startsWith("unconfirmed+")) { send(response, 400, { msg: "Email not confirmed", error_code: "email_not_confirmed" }); return; }
    if (email.startsWith("slow+")) await new Promise((resolve) => setTimeout(resolve, 500));
    send(response, 200, sessionFor(userFor(email))); return;
  }
  if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "pkce") {
    if (!event.hasCodeVerifier || !pending.has(codeEmail)) { send(response, 400, { msg: "Confirmation link has expired", error_code: "flow_state_expired" }); return; }
    const user = pending.get(codeEmail);
    pending.delete(codeEmail);
    send(response, 200, sessionFor(user)); return;
  }
  if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "refresh_token") {
    const previous = refreshTokens.get(body.refresh_token);
    if (!previous) { send(response, 400, { msg: "Refresh token expired", error_code: "refresh_token_not_found" }); return; }
    send(response, 200, sessionFor(previous.user)); return;
  }
  if (url.pathname === "/auth/v1/user") {
    if (session?.user.email.startsWith("profile-unavailable+")) { send(response, 503, { msg: "Authentication is temporarily unavailable", error_code: "unexpected_failure" }); return; }
    if (!session || session.user.email.startsWith("profile-failure+")) { send(response, 401, { msg: "Session is no longer valid", error_code: "session_not_found" }); return; }
    send(response, 200, session.user); return;
  }
  if (url.pathname === "/auth/v1/logout") {
    if (session?.user.email.startsWith("logout-failure+")) { send(response, 503, { msg: "Sign out could not be confirmed", error_code: "unexpected_failure" }); return; }
    if (session) { sessions.delete(token); refreshTokens.delete(session.refresh_token); }
    send(response, 200, {}); return;
  }
  if (url.pathname === "/auth/v1/resend" || url.pathname === "/auth/v1/recover") {
    if (url.pathname.endsWith("recover")) pending.set(email, userFor(email));
    send(response, 200, {}); return;
  }
  send(response, 404, { msg: "Unsupported local auth fixture endpoint" });
}).listen(port, host, () => process.stdout.write(`Local Auth fixture listening on ${base}\n`));
