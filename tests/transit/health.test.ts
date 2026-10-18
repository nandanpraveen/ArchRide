import { test } from "node:test";
import assert from "node:assert/strict";
import { GET } from "../../src/app/api/health/route";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/supabase/database.types";
import {
  readStopArrivals,
  readRoutes,
  readStops,
} from "../../src/lib/transit/read";

// Exercise the actual HTTP handler without hosted credentials or upstream calls.
test("health endpoint: unconfigured, connected, stale and database failures stay honest", async () => {
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const originalFetch = globalThis.fetch;
  try {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    assert.equal((await GET()).status, 503);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://database.example.test";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "public-test-key";
    const now = new Date().toISOString();
    let rows = ["static", "vehicles", "arrivals", "alerts"].map((feed) => ({
      id: "uga-passio:" + feed,
      last_success_at: now,
      last_attempt_at: now,
      updated_at: now,
      source_timestamp: now,
      state: "healthy",
      entity_count: 0,
      error_code: null,
      next_attempt_at: null,
    }));
    globalThis.fetch = async (input) => {
      assert(
        String(input).startsWith(
          "https://database.example.test/rest/v1/feed_status",
        ),
      );
      return Response.json(rows);
    };
    const good = await GET();
    assert.equal(good.status, 200);
    assert.equal((await good.json()).transit, "connected");
    rows = rows.map((r) => ({
      ...r,
      source_timestamp: new Date(Date.now() - 181000).toISOString(),
    }));
    assert.equal((await (await GET()).json()).transit, "degraded");
    globalThis.fetch = async () =>
      Response.json({ code: "unavailable" }, { status: 503 });
    const failed = await GET();
    assert.equal(failed.status, 503);
    assert.equal((await failed.json()).database, "unavailable");
  } finally {
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined)
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = oldKey;
    globalThis.fetch = originalFetch;
  }
});

test("public read helpers only query Supabase and apply active/arrival validity constraints", async () => {
  const urls: URL[] = [];
  const client = createClient<Database>(
    "https://database.example.test",
    "public-test-key",
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (input) => {
          urls.push(new URL(String(input)));
          return Response.json([]);
        },
      },
    },
  );
  await readRoutes(client);
  await readStops(client);
  const result = await readStopArrivals(client, "uga-passio:a");
  assert.deepEqual(result.data, []);
  assert(urls.every((url) => url.hostname === "database.example.test"));
  assert.equal(urls[0].searchParams.get("active"), "eq.true");
  assert.equal(urls[1].searchParams.get("active"), "eq.true");
  assert.equal(urls[2].searchParams.get("limit"), "3");
  assert.equal(urls[2].searchParams.get("relationship"), "eq.SCHEDULED");
  assert(urls[2].searchParams.has("update_timestamp"));
});
