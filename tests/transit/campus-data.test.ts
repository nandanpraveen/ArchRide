import { test } from "node:test";
import assert from "node:assert/strict";
import { matchPlaces, type Place } from "../../src/lib/campus-data";
test("Home contract search supports whitespace, aliases, accents, duplicate names and bounded stable results", () => {
  const places: Place[] = [
    {
      id: "2",
      name: "Mémorial Hall",
      type: "building",
      locationLabel: "Campus",
      aliases: ["Student Center"],
    },
    {
      id: "1",
      name: "Memorial Hall",
      type: "stop",
      locationLabel: "Eastbound",
    },
  ];
  assert.equal(matchPlaces(places, "  STUDENT   center ")[0].id, "2");
  assert.equal(matchPlaces(places, "memorial hall").length, 2);
  assert.deepEqual(matchPlaces(places, "unknown"), []);
  assert.deepEqual(matchPlaces(places, "  "), []);
  assert.equal(
    matchPlaces(
      Array.from({ length: 50 }, (_, i) => ({ ...places[0], id: String(i) })),
      "Hall",
    ).length,
    30,
  );
});

test("explicitly archived source stops cannot become ordinary trip choices", () => {
  const stops: Place[] = [
    { id: "old", name: "xARCHIVE_Tate", type: "stop", locationLabel: "Source archive" },
    { id: "current", name: "Tate Center", type: "stop", locationLabel: "Boarding stop" },
  ];
  assert.deepEqual(matchPlaces(stops, "Tate").map((p) => p.id), ["current"]);
});

test("word matches rank above incidental substrings in campus search", () => {
  const places: Place[] = [
    { id: "garden", name: "State Botanical Gardens", type: "stop", locationLabel: "Campus" },
    { id: "tate", name: "Tate Student Center", type: "building", locationLabel: "Campus" },
  ];
  assert.deepEqual(matchPlaces(places, "Tate").map((place) => place.id), ["tate", "garden"]);
});
