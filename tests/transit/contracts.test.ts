import { test } from "node:test";
import assert from "node:assert/strict";
import { activeTransitAlerts, freshness, usableArrival } from "../../src/lib/transit/contracts";
import type { Tables } from "../../src/lib/supabase/database.types";

test("source alert periods include their start and exclude their end without inventing active notices", () => {
  const now = Date.parse("2026-10-20T16:00:00Z");
  const seconds = now / 1000;
  const alert = (id: string, active_periods: Tables<"transit_alerts">["active_periods"], active = true) =>
    ({ id, active_periods, active } as Tables<"transit_alerts">);
  assert.deepEqual(activeTransitAlerts([
    alert("unbounded", []),
    alert("start", [{ start: seconds }]),
    alert("future", [{ start: seconds + 1 }]),
    alert("ended", [{ end: seconds }]),
    alert("open", [{ start: null, end: seconds + 1 }]),
    alert("bad", [{ start: "tomorrow" }]),
    alert("inactive", [], false),
  ], now).map(({ id }) => id), ["unbounded", "start", "open"]);
});

test("freshness and predictions follow source time and never revive expired/cancelled arrivals", () => {
  const now = Date.parse("2026-10-20T16:00:00Z");
  assert.equal(freshness(null, 180, now), "unavailable");
  assert.equal(freshness(new Date(now - 181_000).toISOString(), 180, now), "stale");
  assert.equal(freshness(new Date(now + 121_000).toISOString(), 180, now), "stale");
  const arrival = {
    relationship: "SCHEDULED", provenance: "source",
    arrival_at: new Date(now + 60_000).toISOString(),
    valid_until: new Date(now + 120_000).toISOString(),
    update_timestamp: new Date(now).toISOString(),
  } as Tables<"transit_arrivals">;
  assert(usableArrival(arrival, now));
  assert(!usableArrival({ ...arrival, relationship: "CANCELED" }, now));
  assert(!usableArrival(arrival, now + 120_000));
});
