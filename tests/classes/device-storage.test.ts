import assert from "node:assert/strict";
import test from "node:test";
import { readDeviceClasses, writeDeviceClasses } from "../../src/lib/classes";

test("one corrupt stored class cannot hide valid schedules and blocked storage reports failure", () => {
  const entry = { id: "valid", title: "Calculus", buildingId: "building", buildingName: "Memorial", weekdays: [1, 3], startsAt: "09:30", minutesEarly: 10, enabled: true, reminderEnabled: false };
  let raw = JSON.stringify([null, {}, { ...entry, title: 42 }, { ...entry, weekdays: "Monday" }, entry]);
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => raw, setItem: (_: string, value: string) => { raw = value; } } });
  try {
    assert.deepEqual(readDeviceClasses(), [entry]);
    assert.equal(writeDeviceClasses([entry]), true);
    assert.deepEqual(readDeviceClasses(), [entry]);
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } } });
    assert.deepEqual(readDeviceClasses(), []);
    assert.equal(writeDeviceClasses([entry]), false);
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
