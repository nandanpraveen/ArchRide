import { test } from "node:test";
import assert from "node:assert/strict";
import { mapCoordinates, mapPath, routeColor } from "../../src/lib/transit/map-data";
import type { Route } from "../../src/lib/transit/contracts";

test("map geometry keeps valid zero coordinates and rejects a malformed source path without bridging it", () => {
  assert(mapCoordinates(0, 0));
  assert(!mapCoordinates(181, 33));
  assert(!mapCoordinates(-83, NaN));
  assert.deepEqual(mapPath([[0, 0], [-83.37, 33.95]]), [[0, 0], [-83.37, 33.95]]);
  assert.deepEqual(mapPath([[0, 0], [181, 33], [-83.37, 33.95]]), []);
  assert.deepEqual(mapPath([{ latitude: 33, longitude: -83 }]), []);
});

test("route colors accept source hex values and reject arbitrary CSS", () => {
  assert.equal(routeColor({ color: "CC0000" } as Route), "#CC0000");
  assert.equal(routeColor({ color: "#CC0000" } as Route), "#CC0000");
  assert.equal(routeColor({ color: "url(https://example.com)" } as Route), "#8f2631");
});
