import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import {
  DEFAULT_PREFERENCES,
  activeNotifications,
  isInAppLink,
  isValidBusLeadMinutes,
  readDeviceNotifications,
  readDevicePreferences,
  validatePreferences,
  writeDeviceNotifications,
  writeDevicePreferences,
  type NotificationEntry,
} from "../../src/lib/notifications";

const NOTIFICATIONS_KEY = "archride.notifications.v1";
const PREFERENCES_KEY = "archride.notification-preferences.v1";

const entry = (overrides: Partial<NotificationEntry> = {}): NotificationEntry => ({
  id: "n1",
  type: "leave_now",
  title: "Route L is about 5 min away",
  body: "",
  link: "/",
  dedupeKey: "leave:trip-1:stop-1",
  createdAt: "2026-10-30T12:00:00.000Z",
  expiresAt: "2026-10-30T12:10:00.000Z",
  readAt: null,
  ...overrides,
});

// A stand-in for the browser's localStorage, which Node does not have.
let store: Map<string, string>;
let failWrites = false;
beforeEach(() => {
  store = new Map();
  failWrites = false;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (failWrites) throw new Error("quota exceeded");
        store.set(key, value);
      },
    },
  });
});
afterEach(() => {
  Reflect.deleteProperty(globalThis, "localStorage");
});

test("expired notifications are hidden and the rest are newest first", () => {
  const now = Date.parse("2026-10-30T12:05:00.000Z");
  const older = entry({ id: "older", createdAt: "2026-10-30T12:00:00.000Z" });
  const newer = entry({ id: "newer", createdAt: "2026-10-30T12:02:00.000Z" });
  const expired = entry({ id: "expired", expiresAt: "2026-10-30T12:04:59.000Z" });
  assert.deepEqual(
    activeNotifications([older, expired, newer], now).map((item) => item.id),
    ["newer", "older"],
  );
});

test("a notification that expires exactly now is hidden", () => {
  const now = Date.parse("2026-10-30T12:10:00.000Z");
  assert.deepEqual(activeNotifications([entry()], now), []);
});

test("links must stay inside the app", () => {
  for (const ok of ["/", "/map", "/map?stop=abc"]) assert.equal(isInAppLink(ok), true, ok);
  for (const bad of ["", "map", "//evil.example", "https://evil.example", "/\\evil.example", null, 5]) {
    assert.equal(isInAppLink(bad), false, String(bad));
  }
});

test("the bus lead time must be a whole number from 1 to 15", () => {
  for (const ok of [1, 5, 15]) assert.equal(isValidBusLeadMinutes(ok), true, String(ok));
  for (const bad of [0, 16, -1, 2.5, NaN, "5", null]) assert.equal(isValidBusLeadMinutes(bad), false, String(bad));
});

test("guest notifications survive a save and reload", () => {
  const saved = [entry({ id: "a" }), entry({ id: "b", dedupeKey: "other", readAt: "2026-10-30T12:03:00.000Z" })];
  assert.equal(writeDeviceNotifications(saved), true);
  assert.deepEqual(readDeviceNotifications(), saved);
});

test("guest notifications read back as empty when nothing is saved or the data is corrupt", () => {
  assert.deepEqual(readDeviceNotifications(), []);
  store.set(NOTIFICATIONS_KEY, "not json");
  assert.deepEqual(readDeviceNotifications(), []);
  store.set(NOTIFICATIONS_KEY, JSON.stringify({ not: "a list" }));
  assert.deepEqual(readDeviceNotifications(), []);
});

test("edited or broken guest notifications are dropped and good ones kept", () => {
  const good = entry({ id: "good" });
  store.set(
    NOTIFICATIONS_KEY,
    JSON.stringify([
      good,
      null,
      { ...entry({ id: "bad-type" }), type: "weird" },
      { ...entry({ id: "bad-link" }), link: "https://evil.example" },
      { ...entry({ id: "no-title" }), title: "" },
      { ...entry({ id: "bad-time" }), expiresAt: "soon" },
      { ...entry({ id: "expires-first" }), expiresAt: "2026-10-30T11:59:00.000Z" },
    ]),
  );
  assert.deepEqual(readDeviceNotifications(), [good]);
});

test("saving reports false when the browser refuses to store the data", () => {
  failWrites = true;
  assert.equal(writeDeviceNotifications([entry()]), false);
  assert.equal(writeDevicePreferences(DEFAULT_PREFERENCES), false);
});

test("guest settings survive a save and reload", () => {
  const prefs = { ...DEFAULT_PREFERENCES, leaveNowEnabled: false, busLeadMinutes: 12 };
  assert.equal(writeDevicePreferences(prefs), true);
  assert.deepEqual(readDevicePreferences(), prefs);
});

test("guest settings fall back to the defaults when nothing valid is saved", () => {
  assert.deepEqual(readDevicePreferences(), DEFAULT_PREFERENCES);
  store.set(PREFERENCES_KEY, "not json");
  assert.deepEqual(readDevicePreferences(), DEFAULT_PREFERENCES);
  store.set(PREFERENCES_KEY, "null");
  assert.deepEqual(readDevicePreferences(), DEFAULT_PREFERENCES);
});

test("one broken guest setting falls back alone and the others are kept", () => {
  store.set(PREFERENCES_KEY, JSON.stringify({ leaveNowEnabled: false, busLeadMinutes: 99, alertsEnabled: "yes" }));
  assert.deepEqual(readDevicePreferences(), { ...DEFAULT_PREFERENCES, leaveNowEnabled: false });
});

const withLeadTime = (busLeadMinutes: number) => ({ ...DEFAULT_PREFERENCES, busLeadMinutes });
const RANGE_MESSAGE = "Choose a whole number of minutes from 1 to 15.";
const WHOLE_NUMBER_MESSAGE = "Please enter a whole number of minutes";

test("settings with a lead time from 1 to 15 have nothing to complain about", () => {
  for (const minutes of [1, 5, 15]) assert.equal(validatePreferences(withLeadTime(minutes)), null, String(minutes));
});

test("a lead time outside 1 to 15 asks for a number in range", () => {
  for (const minutes of [0, 16, -3, 0.5, 15.5, NaN]) {
    assert.equal(validatePreferences(withLeadTime(minutes)), RANGE_MESSAGE, String(minutes));
  }
});

test("a decimal lead time inside the range asks for a whole number", () => {
  for (const minutes of [1.5, 2.5, 14.9]) {
    assert.equal(validatePreferences(withLeadTime(minutes)), WHOLE_NUMBER_MESSAGE, String(minutes));
  }
});
