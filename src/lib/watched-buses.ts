import type { SupabaseClient } from "@supabase/supabase-js";
import type { WatchedBus } from "@/lib/leave-now";
import type { Database } from "@/lib/supabase/database.types";
import type { Arrival } from "@/lib/transit/contracts";
import { arrivalEstimate, type ArrivalEstimate } from "@/lib/transit/estimates";

export type WatchedBusEntry = WatchedBus & { addedAt: number };
type BusId = Pick<WatchedBus, "tripId" | "stopId">;

export const MAX_WATCHED_BUSES = 5;
// A watch is dropped after this long, so a forgotten bus stops being checked.
export const WATCH_LIFETIME_MS = 3 * 60 * 60_000;
// Keeps "Route L at Stop" inside the 200-character notification body limit.
const MAX_NAME = 80;

const sameBus = (a: BusId, b: BusId) =>
  a.tripId === b.tripId && a.stopId === b.stopId;
export const isWatched = (list: WatchedBusEntry[], bus: BusId) =>
  list.some((item) => sameBus(item, bus));

export function addWatched(
  list: WatchedBusEntry[],
  bus: WatchedBus,
  now = Date.now(),
): WatchedBusEntry[] {
  if (isWatched(list, bus)) return list;
  const entry = {
    ...bus,
    routeName: bus.routeName.slice(0, MAX_NAME),
    stopName: bus.stopName.slice(0, MAX_NAME),
    addedAt: now,
  };
  // At the limit, the oldest watch makes room for the newest.
  return [...list, entry].slice(-MAX_WATCHED_BUSES);
}

export const removeWatched = (list: WatchedBusEntry[], bus: BusId) =>
  list.filter((item) => !sameBus(item, bus));
export const pruneWatched = (list: WatchedBusEntry[], now = Date.now()) =>
  list.filter((item) => now - item.addedAt < WATCH_LIFETIME_MS);

// Prefer a live prediction, then a cancellation, then the weaker states, so one bus has one answer.
const STATE_PRIORITY: Record<ArrivalEstimate["state"], number> = {
  valid: 0,
  cancelled: 1,
  passed: 2,
  stale: 3,
  missing: 4,
};

/** The single best estimate for a watched bus from its arrival rows at one stop, or null with no rows. */
export function pickWatchedEstimate(
  rows: Arrival[],
  now = Date.now(),
  connected = true,
): ArrivalEstimate | null {
  const estimates = rows.map((row) => arrivalEstimate(row, now, connected));
  estimates.sort(
    (a, b) =>
      STATE_PRIORITY[a.state] - STATE_PRIORITY[b.state] ||
      Date.parse(a.arrivalAt ?? "") - Date.parse(b.arrivalAt ?? ""),
  );
  return estimates[0] ?? null;
}

/** Once the bus has passed or been cancelled there is nothing left to watch. A missing row is not a cancellation. */
export const shouldStopWatching = (estimate: ArrivalEstimate | null) =>
  estimate?.state === "passed" || estimate?.state === "cancelled";

/** Every arrival row for one trip at one stop, from the public transit data. */
export function readWatchedArrivals(
  db: SupabaseClient<Database>,
  bus: BusId,
  signal?: AbortSignal,
) {
  const bounded = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
    : AbortSignal.timeout(10_000);
  return db
    .from("transit_arrivals")
    .select("*")
    .eq("stop_id", bus.stopId)
    .eq("trip_id", bus.tripId)
    .eq("provenance", "source")
    .limit(10)
    .abortSignal(bounded);
}

/** Reminder keys already created, with when each stops mattering. Clearing a notification must not forget them. */
export type HandledReminders = Record<string, number>;

export function pruneHandled(
  handled: HandledReminders,
  now = Date.now(),
): HandledReminders {
  return Object.fromEntries(
    Object.entries(handled).filter(([, expiresAt]) => expiresAt > now),
  );
}

// Watched buses and handled reminders stay on this device, for guests and signed-in students alike.
const DEVICE_WATCHED_KEY = "archride.watched-buses.v1";
const DEVICE_HANDLED_KEY = "archride.handled-reminders.v1";

const isName = (value: unknown) =>
  typeof value === "string" && value.length > 0 && value.length <= MAX_NAME;
const isId = (value: unknown) =>
  typeof value === "string" && value.length > 0 && value.length <= 200;

function isWatchedEntry(item: unknown): item is WatchedBusEntry {
  if (!item || typeof item !== "object") return false;
  const entry = item as WatchedBusEntry;
  return (
    isId(entry.tripId) &&
    isId(entry.stopId) &&
    isName(entry.routeName) &&
    isName(entry.stopName) &&
    typeof entry.addedAt === "number" &&
    Number.isFinite(entry.addedAt)
  );
}

export function readDeviceWatched(): WatchedBusEntry[] {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(DEVICE_WATCHED_KEY) ?? "[]",
    );
    return Array.isArray(parsed)
      ? parsed.filter(isWatchedEntry).slice(-MAX_WATCHED_BUSES)
      : [];
  } catch {
    return [];
  }
}

export function writeDeviceWatched(list: WatchedBusEntry[]) {
  try {
    localStorage.setItem(DEVICE_WATCHED_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function readDeviceHandled(): HandledReminders {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(DEVICE_HANDLED_KEY) ?? "{}",
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (pair): pair is [string, number] =>
          typeof pair[1] === "number" && Number.isFinite(pair[1]),
      ),
    );
  } catch {
    return {};
  }
}

export function writeDeviceHandled(handled: HandledReminders) {
  try {
    localStorage.setItem(DEVICE_HANDLED_KEY, JSON.stringify(handled));
    return true;
  } catch {
    return false;
  }
}
