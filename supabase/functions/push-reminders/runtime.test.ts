import assert from "node:assert/strict";
import { createECDH, randomBytes } from "node:crypto";
import * as webpush from "web-push";

Deno.test("pinned push package signs and encrypts a payload in the Edge runtime", () => {
  const vapid = webpush.generateVAPIDKeys(), client = createECDH("prime256v1");
  client.generateKeys();
  const request = webpush.generateRequestDetails({
    endpoint: "https://fcm.googleapis.com/fcm/send/runtime-test",
    keys: { p256dh: client.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") },
  }, "ArchRide runtime check", {
    vapidDetails: { subject: "https://nandanpraveen.github.io/archride/", publicKey: vapid.publicKey, privateKey: vapid.privateKey },
    TTL: 60, urgency: "high",
  });
  assert.equal(request.headers.TTL, 60);
  assert.ok(request.body.byteLength > 20);
  assert.ok(!request.body.includes("ArchRide runtime check"));
});

Deno.test("the actual handler boots and rejects bad requests without a database or push", async () => {
  const serve = Deno.serve;
  const values = { SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_SERVICE_ROLE_KEY: "runtime-test-only", ARCHRIDE_RATE_SALT: "", PUSH_JOB_TOKEN: "" };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, Deno.env.get(key)]));
  let handler: (request: Request) => Promise<Response>;
  try {
    for (const [key, value] of Object.entries(values)) Deno.env.set(key, value);
    Deno.serve = ((callback: typeof handler) => { handler = callback; }) as typeof Deno.serve;
    await import("./index.ts");
    assert.equal((await handler!(new Request("https://example.test", { method: "OPTIONS" }))).status, 204);
    assert.equal((await handler!(new Request("https://example.test", { method: "DELETE" }))).status, 405);
    assert.equal((await handler!(new Request("https://example.test", { headers: { origin: "https://untrusted.test" } }))).status, 403);
    assert.equal((await handler!(new Request("https://example.test", { method: "POST", headers: { "content-length": "65537" } }))).status, 413);
  } finally {
    Deno.serve = serve;
    for (const [key, value] of Object.entries(previous)) if (value === undefined) Deno.env.delete(key); else Deno.env.set(key, value);
  }
});
