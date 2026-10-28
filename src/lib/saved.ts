export type SavedStop = {
  id: string;
  name: string;
  savedAt: string;
};

export type WriteResult =
  | { ok: true }
  | { ok: false; reason: "storage-unavailable" };

export type RenameResult =
  | { ok: true }
  | { ok: false; reason: "blank" | "too-long" | "storage-unavailable" };

export const MAX_NAME_LENGTH = 80;

// Guest favorites live only in this browser. The version number lets us
// upgrade the format later without crashing on old data.
const STORAGE_KEY = "archride:saved:v1";
const EMPTY: SavedStop[] = [];
const listeners = new Set<() => void>();

let lastRaw: string | null | undefined;
let lastValue: SavedStop[] = EMPTY;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function isSavedStop(value: unknown): value is SavedStop {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    item.id !== "" &&
    typeof item.name === "string" &&
    typeof item.savedAt === "string"
  );
}

function parse(raw: string | null): SavedStop[] {
  if (!raw) return EMPTY;
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== "object" || data === null) return EMPTY;
    const record = data as { version?: unknown; stops?: unknown };
    if (record.version !== 1 || !Array.isArray(record.stops)) return EMPTY;
    return record.stops.filter(isSavedStop);
  } catch {
    return EMPTY;
  }
}

export function getSavedStops(): SavedStop[] {
  const raw = readRaw();
  if (raw !== lastRaw) {
    lastRaw = raw;
    lastValue = parse(raw);
  }
  return lastValue;
}

export function subscribeSavedStops(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function write(stops: SavedStop[]): WriteResult {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, stops }),
    );
  } catch {
    return { ok: false, reason: "storage-unavailable" };
  }
  listeners.forEach((callback) => callback());
  return { ok: true };
}

export function saveStop(stop: { id: string; name: string }): WriteResult {
  const current = getSavedStops();
  if (current.some((item) => item.id === stop.id)) return { ok: true };
  return write([
    ...current,
    { id: stop.id, name: stop.name, savedAt: new Date().toISOString() },
  ]);
}

export function unsaveStop(id: string): WriteResult {
  return write(getSavedStops().filter((item) => item.id !== id));
}

export function renameStop(id: string, name: string): RenameResult {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, reason: "blank" };
  if (trimmed.length > MAX_NAME_LENGTH) return { ok: false, reason: "too-long" };
  const result = write(
    getSavedStops().map((item) =>
      item.id === id ? { ...item, name: trimmed } : item,
    ),
  );
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

export function moveStop(id: string, direction: -1 | 1): WriteResult {
  const current = [...getSavedStops()];
  const from = current.findIndex((item) => item.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= current.length) return { ok: true };
  current.splice(to, 0, ...current.splice(from, 1));
  return write(current);
}

// Used by "Undo" to put back exactly what was there before.
export function replaceSavedStops(stops: SavedStop[]): WriteResult {
  return write(stops);
}