import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PARKING_LOTS, parkingAccess, parkingSchedule } from "../../src/lib/parking";
import { CAMPUS_BUFFER_METERS, CAMPUS_MAX_BOUNDS, constrainCampusCamera, insideCampusBounds } from "../../src/lib/campus-bounds";
const lot = (code: string) => PARKING_LOTS.find(p => p.code === code)!;

test("every reviewed official enforcement code and extra mapped lot has one sourced, in-bounds pin", () => {
  const audit = JSON.parse(readFileSync("docs/parking/inventory-audit.json", "utf8"));
  assert.equal(PARKING_LOTS.length, 88);
  assert.equal(new Set(PARKING_LOTS.map(p => p.id)).size, PARKING_LOTS.length);
  assert.equal(new Set(PARKING_LOTS.map(p => p.code)).size, PARKING_LOTS.length);
  for (const code of [...audit.enforcementCodes, ...audit.additionalMapOrGisCodes]) assert.ok(lot(code), code);
  for (const p of PARKING_LOTS) {
    assert.ok(Number.isFinite(p.latitude) && Number.isFinite(p.longitude));
    assert.ok(insideCampusBounds(p.longitude, p.latitude), p.code);
    assert.ok(p.sourceObjectId > 0 && p.sources.every(s => /^https:\/\/(tps\.uga\.edu|maps\.itos\.uga\.edu)\//.test(s)));
    assert.equal(p.verifiedAt, "2026-11-03");
    for (let day = 0; day < 7; day++) {
      const windows = parkingSchedule(p, day);
      assert.equal(windows[0].start, 0);
      assert.equal(windows.at(-1)!.end, 1440);
      windows.forEach((w, index) => { assert.ok(w.end > w.start); if (index) assert.equal(w.start, windows[index - 1].end); });
    }
  }
});

test("ordinary rules honor exact campus boundaries, overnight gaps and source conflicts", () => {
  const access = (code: string, at: string) => parkingAccess(lot(code), Date.parse(at), "ordinary");
  assert.equal(access("E23", "2026-11-03T11:59:59Z"), "unknown");
  assert.equal(access("E23", "2026-11-03T12:00:00Z"), "permit");
  assert.equal(access("E23", "2026-11-03T21:59:59Z"), "permit");
  assert.equal(access("E23", "2026-11-03T22:00:00Z"), "any");
  assert.equal(access("E23", "2026-11-04T05:00:00Z"), "unknown");
  assert.equal(access("N06", "2026-11-03T22:00:00Z"), "registered");
  assert.equal(access("S18", "2026-11-03T22:00:00Z"), "unknown");
  assert.equal(access("N02", "2026-11-07T17:00:00Z"), "unknown");
  assert.equal(access("TSL", "2026-11-03T09:00:00Z"), "permit");
  assert.equal(access("E24", "2026-11-04T00:00:00Z"), "restricted");
});

test("events remain unverified by default and repeated DST hours cannot grant new permission", () => {
  assert.equal(parkingAccess(lot("E23"), Date.parse("2026-11-03T22:00:00Z")), "unknown");
  assert.equal(parkingAccess(lot("E23"), Date.parse("2026-11-03T22:00:00Z"), "event"), "restricted");
  for (const time of ["2026-11-01T05:30:00Z", "2026-11-01T06:30:00Z"]) {
    assert.equal(parkingAccess(lot("N02"), Date.parse(time), "ordinary"), "unknown");
    assert.equal(parkingAccess(lot("E23"), Date.parse(time)), "unknown");
  }
  assert.equal(parkingAccess(lot("E23"), NaN, "ordinary"), "unknown");
});

test("geographic buffer is three miles and rectangular corners are outside it", () => {
  assert.equal(CAMPUS_BUFFER_METERS, 4828.032);
  const [[west, south], [east, north]] = CAMPUS_MAX_BOUNDS;
  for (const point of [[west, south], [west, north], [east, south], [east, north]]) assert.equal(insideCampusBounds(point[0], point[1]), false);
  assert.equal(insideCampusBounds(-84.388, 33.749), false);
  assert.equal(insideCampusBounds(NaN, NaN), false);
  const boundary = JSON.parse(readFileSync("src/lib/campus-boundary.json", "utf8"));
  assert.equal(insideCampusBounds(...boundary.ring[0] as [number, number]), true);
});

test("every parking location remains reachable and camera clamps malformed, distant and corner requests", () => {
  for (const p of PARKING_LOTS) {
    const camera = constrainCampusCamera(p.longitude, p.latitude, 15, 1200, 800);
    assert.ok(Math.abs(camera.center[0] - p.longitude) < 1e-8, p.code);
    assert.ok(Math.abs(camera.center[1] - p.latitude) < 1e-8, p.code);
  }
  const [[west, south], [east, north]] = CAMPUS_MAX_BOUNDS;
  for (const [lng, lat] of [[west, south], [east, north], [-84, 33], [180, 90], [NaN, NaN]]) {
    for (const dimensions of [[320, 300], [1200, 800], [1900, 1000]]) {
      const c = constrainCampusCamera(lng, lat, -10, ...dimensions as [number, number]);
      assert.ok(insideCampusBounds(...c.center));
      assert.ok(c.zoom >= 12 && c.zoom <= 20);
      // Four viewport corners, conservative spherical Mercator geometry.
      const mpp = 156543.03392 * Math.cos(c.center[1] * Math.PI / 180) / 2 ** c.zoom;
      for (const dx of [-1, 1]) for (const dy of [-1, 1]) {
        const x = c.center[0] + dx * dimensions[0] / 2 * mpp / (111320 * Math.cos(c.center[1] * Math.PI / 180));
        const y = c.center[1] + dy * dimensions[1] / 2 * mpp / 111320;
        assert.ok(insideCampusBounds(x, y), JSON.stringify({ lng, lat, c, x, y }));
      }
    }
  }
});
