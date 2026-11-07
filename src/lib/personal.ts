import { deviceKey } from "./device-storage";
import type { Place } from "./campus-data";
export type PlaceRef = Pick<Place, "id" | "name" | "type">;
export const placeRef = (p: PlaceRef): PlaceRef => ({
  id: p.id,
  name: p.name.slice(0, 200),
  type: p.type,
});
export function isPlaceRef(v: unknown): v is PlaceRef {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.id === "string" &&
    p.id.length > 0 &&
    p.id.length <= 200 &&
    typeof p.name === "string" &&
    p.name.length > 0 &&
    p.name.length <= 200 &&
    ["building", "entrance", "stop"].includes(String(p.type)) &&
    Object.keys(p).every((key) => ["id", "name", "type"].includes(key))
  );
}
export type TravelPreferences = {
  displayName: string;
  walkingSpeed: number;
  buffer: number;
  theme: "light" | "dark" | "system";
  defaultOrigin: PlaceRef | null;
  quietStart: string;
  quietEnd: string;
};
export const DEFAULT_TRAVEL: TravelPreferences = {
  displayName: "",
  walkingSpeed: 1.34,
  buffer: 3,
  theme: "system",
  defaultOrigin: null,
  quietStart: "",
  quietEnd: "",
};
export function validTravel(p: TravelPreferences) {
  return (
    !!p &&
    typeof p.displayName === "string" &&
    p.displayName.length <= 80 &&
    Number.isFinite(p.walkingSpeed) &&
    p.walkingSpeed >= 0.7 &&
    p.walkingSpeed <= 2.2 &&
    Number.isInteger(p.buffer) &&
    p.buffer >= 0 &&
    p.buffer <= 30 &&
    ["light", "dark", "system"].includes(p.theme) &&
    (p.defaultOrigin === null || isPlaceRef(p.defaultOrigin)) &&
    ((!p.quietStart && !p.quietEnd) ||
      [p.quietStart, p.quietEnd].every((t) =>
        /^([01]\d|2[0-3]):[0-5]\d$/.test(t),
      ))
  );
}
export type SavedItem = {
  id: string;
  key: string;
  kind: "stop" | "journey";
  name: string;
  origin: PlaceRef | null;
  destination: PlaceRef;
  position: number;
  updatedAt: string;
};
export type ActiveTrip = {
  origin: PlaceRef | null;
  destination: PlaceRef;
  mode: "walk" | "bus";
  step: number;
  instanceKey: string | null;
  boardingSequence: number | null;
  boarding: PlaceRef | null;
  alighting: PlaceRef | null;
  routeName: string;
  headsign: string;
  deadline: string | null;
  expiresAt: string;
  /** The selected plan is comparison metadata, never a current arrival prediction. */
  tripId?: string | null;
  alightingSequence?: number | null;
  selectedBoardingAt?: string | null;
  selectedDestinationArrivalAt?: string | null;
  walkToSeconds?: number | null;
  walkFromSeconds?: number | null;
};
export function validSaved(v: unknown): v is SavedItem {
  if (!v || typeof v !== "object") return false;
  const s = v as SavedItem;
  return (
    typeof s.id === "string" &&
    typeof s.key === "string" &&
    typeof s.name === "string" &&
    s.name.trim().length > 0 &&
    s.name.length <= 80 &&
    Number.isInteger(s.position) &&
    s.position >= 0 &&
    isPlaceRef(s.destination) &&
    ((s.kind === "stop" &&
      s.destination.type === "stop" &&
      s.origin === null) ||
      (s.kind === "journey" && isPlaceRef(s.origin)))
  );
}
export function validActive(v: unknown, now = Date.now()): v is ActiveTrip {
  if (!v || typeof v !== "object") return false;
  const a = v as ActiveTrip;
  return (
    isPlaceRef(a.destination) &&
    (a.origin === null || isPlaceRef(a.origin)) &&
    ["walk", "bus"].includes(a.mode) &&
    Number.isInteger(a.step) &&
    a.step >= 0 &&
    a.step <= (a.mode === "bus" ? 4 : 1) &&
    (a.instanceKey === null ||
      (typeof a.instanceKey === "string" && a.instanceKey.length <= 300)) &&
    (a.boardingSequence === null ||
      (Number.isInteger(a.boardingSequence) && a.boardingSequence >= 0)) &&
    (a.boarding === null || isPlaceRef(a.boarding)) &&
    (a.alighting === null || isPlaceRef(a.alighting)) &&
    typeof a.routeName === "string" &&
    a.routeName.length <= 200 &&
    typeof a.headsign === "string" &&
    a.headsign.length <= 200 &&
    (a.deadline === null || Number.isFinite(Date.parse(a.deadline))) &&
    (a.tripId == null ||
      (typeof a.tripId === "string" && a.tripId.length <= 200)) &&
    (a.alightingSequence == null ||
      (Number.isInteger(a.alightingSequence) &&
        a.alightingSequence >= 0 &&
        (a.boardingSequence == null || a.alightingSequence > a.boardingSequence))) &&
    [a.selectedBoardingAt, a.selectedDestinationArrivalAt].every(
      (value) => value == null || Number.isFinite(Date.parse(value)),
    ) &&
    [a.walkToSeconds, a.walkFromSeconds].every(
      (value) => value == null || (Number.isInteger(value) && value >= 0 && value <= 7200),
    ) &&
    Date.parse(a.expiresAt) > now &&
    Date.parse(a.expiresAt) <= now + 6 * 3600_000
  );
}
export const savedKey = (origin: PlaceRef | null, destination: PlaceRef) =>
  origin
    ? `journey:${origin.type}:${origin.id}:${destination.type}:${destination.id}`
    : `stop:${destination.id}`;
export function quietNow(
  p: Pick<TravelPreferences, "quietStart" | "quietEnd">,
  now = Date.now(),
) {
  if (!p.quietStart || !p.quietEnd || p.quietStart === p.quietEnd) return false;
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  return p.quietStart < p.quietEnd
    ? time >= p.quietStart && time < p.quietEnd
    : time >= p.quietStart || time < p.quietEnd;
}
export function readPersonalDevice() {
  try {
    const raw = localStorage.getItem(deviceKey("archride.personal.v1"));
    const data = JSON.parse(raw ?? "{}");
    if (!raw) {
      const old = JSON.parse(localStorage.getItem(deviceKey("archride:saved:v1")) ?? "{}");
      if (old.version === 1 && Array.isArray(old.stops))
        data.items = old.stops
          .filter(
            (s: { id?: unknown; name?: unknown }) =>
              typeof s.id === "string" &&
              typeof s.name === "string" &&
              s.name.trim(),
          )
          .map(
            (s: { id: string; name: string; savedAt?: string }, i: number) => ({
              id: `legacy-stop:${s.id}`,
              key: `stop:${s.id}`,
              kind: "stop",
              name: s.name.slice(0, 80),
              origin: null,
              destination: {
                id: s.id,
                name: s.name.slice(0, 200),
                type: "stop",
              },
              position: i,
              updatedAt: s.savedAt ?? new Date().toISOString(),
            }),
          );
    }
    return {
      prefs: validTravel(data.prefs)
        ? (data.prefs as TravelPreferences)
        : DEFAULT_TRAVEL,
      items: Array.isArray(data.items)
        ? (data.items.filter(validSaved).slice(0, 200) as SavedItem[])
        : [],
      active: validActive(data.active) ? (data.active as ActiveTrip) : null,
    };
  } catch {
    return {
      prefs: DEFAULT_TRAVEL,
      items: [] as SavedItem[],
      active: null as ActiveTrip | null,
    };
  }
}
export function planRefHref(origin: PlaceRef | null, destination: PlaceRef) {
  const params = new URLSearchParams({
    to: destination.id,
    toType: destination.type,
  });
  if (origin) {
    params.set("from", origin.id);
    params.set("fromType", origin.type);
  }
  return `/plan?${params}`;
}
