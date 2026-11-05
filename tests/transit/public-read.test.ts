import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/supabase/database.types";
import { readStopArrivals } from "../../src/lib/transit/read";

test("stop arrival reads only query the shared backend with source validity constraints", async () => {
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
  const result = await readStopArrivals(client, "uga-passio:a");
  assert.deepEqual(result.data, []);
  assert(urls.every((url) => url.hostname === "database.example.test"));
  assert.equal(urls[0].searchParams.get("limit"), "3");
  assert.equal(urls[0].searchParams.get("relationship"), "eq.SCHEDULED");
  assert(urls[0].searchParams.has("update_timestamp"));
});
