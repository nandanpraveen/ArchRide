import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PREFERENCES } from "../../src/lib/notifications";
import { DEFAULT_TRAVEL, type ActiveTrip } from "../../src/lib/personal";
import { dueReminder, scheduledClassReminder, scheduledWalkReminder } from "../../src/lib/reminder-schedule";
import { pushRemindersDue, validPushState, validSubscription, type PushState } from "../../src/lib/push-reminders";
import type { Arrival, FeedHealth } from "../../src/lib/transit/contracts";
import { localDatabase } from "../../scripts/transit/local-db";

const now = Date.parse("2026-11-09T14:00:00Z");
const iso = (seconds: number) => new Date(now + seconds * 1000).toISOString();
const destination = { id: "mlc", name: "Miller Learning Center", type: "building" as const };
const trip: ActiveTrip = { origin: { ...destination, id: "tate", name: "Tate" }, destination, mode: "walk", step: 0, instanceKey: null, boardingSequence: null, boarding: null, alighting: null, routeName: "", headsign: "", deadline: iso(780), walkToSeconds: 600, expiresAt: iso(3600) };
const state = (): PushState => ({ watched: [], scheduled: [], preferences: { ...DEFAULT_PREFERENCES }, quietStart: "", quietEnd: "" });
const feed = { id: "uga-passio:arrivals", state: "healthy", updated_at: iso(0), last_success_at: iso(0), source_timestamp: iso(0) } as FeedHealth;
const bus = { arrivalId: "exact-row", tripId: "trip", stopId: "tate", routeName: "Campus Loop", stopName: "Tate", walkSeconds: 180, safetySeconds: 120, addedAt: now - 60000 };
const arrival = { id: "exact-row", trip_id: "trip", stop_id: "tate", arrival_at: iso(330), departure_at: null, update_timestamp: iso(0), valid_until: iso(180), relationship: "SCHEDULED", provenance: "source", timestamp_kind: "trip" } as Arrival;

test("walking leave time subtracts travel and buffer, and suppresses late or completed trips", () => {
  const job = scheduledWalkReminder(trip, 3)!;
  assert.equal(job.dueAt, now);
  assert.equal(dueReminder(job, now - 1), false);
  assert.equal(dueReminder(job, now), true);
  assert.equal(dueReminder(job, now + 90001), false);
  assert.equal(scheduledWalkReminder({ ...trip, step: 1 }, 3), null);
  assert.equal(scheduledWalkReminder({ ...trip, deadline: null }, 3), null);
  assert.equal(scheduledWalkReminder({ ...trip, walkToSeconds: null }, 3), null);
  assert.equal(pushRemindersDue({ ...state(), scheduled: [job] }, [], null, {}, now)[0].title, "Time to walk to your destination");
});

test("class jobs distinguish a calculated walk from a heads-up without a route", () => {
  const job = { jobKey: "calc:2026-11-09", classId: "calc", title: "Calculus", buildingId: "mlc", buildingName: destination.name, startTime: iso(900), arriveBy: iso(780) };
  assert.equal(scheduledClassReminder(job, DEFAULT_TRAVEL, 600).dueAt, now);
  assert.equal(scheduledClassReminder(job, DEFAULT_TRAVEL, null).notification.title, "Your class is coming up");
  assert.equal(scheduledClassReminder(job, DEFAULT_TRAVEL, null).dueAt, now + 780000);
});

test("background bus reminders use the exact occurrence, a fresh feed, walking and buffer", () => {
  const input = { ...state(), watched: [bus] };
  assert.equal(pushRemindersDue(input, [arrival], feed, {}, now)[0].title, "Time to leave for your bus");
  assert.deepEqual(pushRemindersDue(input, [{ ...arrival, id: "different-run" }], feed, {}, now), []);
  assert.deepEqual(pushRemindersDue(input, [arrival], null, {}, now), []);
  assert.deepEqual(pushRemindersDue(input, [{ ...arrival, update_timestamp: iso(-600) }], feed, {}, now), []);
  assert.deepEqual(pushRemindersDue(input, [arrival], feed, { "leave:exact-row": now + 100000 }, now), []);
  assert.equal(pushRemindersDue(input, [{ ...arrival, arrival_at: iso(200) }], feed, {}, now)[0].title, "Recheck your trip");
});

test("quiet hours, preference changes, expired watches and jobs suppress background delivery", () => {
  const job = scheduledWalkReminder(trip, 3)!;
  const input = { ...state(), watched: [bus], scheduled: [job] };
  assert.deepEqual(pushRemindersDue({ ...input, quietStart: "08:00", quietEnd: "10:00" }, [arrival], feed, {}, now), []);
  assert.deepEqual(pushRemindersDue({ ...input, preferences: { ...DEFAULT_PREFERENCES, leaveNowEnabled: false } }, [arrival], feed, {}, now), []);
  assert.deepEqual(pushRemindersDue({ ...state(), watched: [{ ...bus, addedAt: now - 10800001 }] }, [arrival], feed, {}, now), []);
  assert.deepEqual(pushRemindersDue({ ...state(), scheduled: [job] }, [], null, {}, now + 90001), []);
});

test("public push intake rejects unsafe endpoints, invalid preferences and unbounded schedules", () => {
  const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/device", keys: { auth: "a".repeat(22), p256dh: "B".repeat(87) } };
  assert.equal(validSubscription(subscription), true);
  for (const endpoint of ["https://127.0.0.1/internal", "https://fcm.googleapis.com.evil.test/send", "https://web.push.apple.com:8443/send", "https://user:pass@web.push.apple.com/send", "http://web.push.apple.com/send"]) assert.equal(validSubscription({ ...subscription, endpoint }), false);
  assert.equal(validPushState(state(), now), true);
  assert.equal(validPushState({ ...state(), watched: [bus], scheduled: [scheduledWalkReminder(trip, 3)] }, now), true);
  assert.equal(validPushState({ ...state(), scheduled: Array(65).fill(scheduledWalkReminder(trip, 3)) }, now), false);
  assert.equal(validPushState({ ...state(), preferences: { ...DEFAULT_PREFERENCES, busLeadMinutes: -1 } }, now), false);
  assert.equal(validPushState({ ...state(), quietStart: "25:70" }, now), false);
});

test("push capabilities and subscription data cannot be read or changed through student roles", async () => {
  const { engine } = await localDatabase();
  try {
    await engine.query("insert into archride_private.push_devices(token_hash,endpoint_hash,subscription,state) values($1,$2,$3,$4)", ["a".repeat(64), "b".repeat(64), "{}", "{}"]);
    for (const role of ["anon", "authenticated"]) {
      await engine.exec(`set role ${role}`);
      await assert.rejects(engine.query("select * from archride_private.push_devices"), { code: "42501" });
      await assert.rejects(engine.query("delete from archride_private.push_devices"), { code: "42501" });
      await engine.exec("reset role");
    }
    await engine.exec("set role service_role");
    assert.equal((await engine.query("select * from archride_private.push_devices")).rows.length, 1);
    await assert.rejects(engine.query("insert into archride_private.push_devices(token_hash,endpoint_hash,subscription,state) values($1,$2,'{}','{}')", ["c".repeat(64), "b".repeat(64)]), { code: "23505" });
  } finally { await engine.close(); }
});
