import records from "./parking-data.json";

export type ParkingCategory = "permit" | "registered" | "any" | "unknown" | "restricted";
export type ParkingLot = {
  id: string; code: string; name: string; type: "lot" | "deck";
  longitude: number; latitude: number;
  weekday: ParkingCategory; evening: ParkingCategory; weekend: ParkingCategory;
  paid: string; notes: string[]; sourceObjectId: number; sources: string[]; verifiedAt: string;
};
export const PARKING_LOTS = records as readonly ParkingLot[];
export const PARKING_SOURCE = "https://tps.uga.edu/parking/enforcement/";
export const PARKING_EVENTS = "https://tps.uga.edu/parking/football/";
export const CATEGORY_LABEL: Record<ParkingCategory, string> = {
  permit: "Lot permit required", registered: "TPS-registered vehicles", any: "Any vehicle under ordinary rules",
  unknown: "Unknown: check TPS and posted signs", restricted: "Restricted: check event instructions",
};
export const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export type ParkingWindow = { start: number; end: number; category: ParkingCategory };
export function parkingSchedule(lot: ParkingLot, day: number): ParkingWindow[] {
  if (day === 0 || day === 6) return [{ start: 0, end: 1440, category: lot.weekend }];
  const start = lot.code === "TSL" ? 240 : 420;
  return [
    { start: 0, end: start, category: "unknown" },
    { start, end: 1020, category: lot.weekday },
    { start: 1020, end: lot.code === "E24" ? 1140 : 1440, category: lot.evening },
    ...(lot.code === "E24" ? [{ start: 1140, end: 1440, category: "restricted" as const }] : []),
  ];
}
const campusClock = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** Event/holiday conditions are not inferred from a weekly timetable. */
export function parkingAccess(lot: ParkingLot, now = Date.now(), eventStatus: "unverified" | "ordinary" | "event" = "unverified"): ParkingCategory {
  if (!Number.isFinite(now) || eventStatus === "unverified") return "unknown";
  if (eventStatus === "event") return "restricted";
  const parts = campusClock.formatToParts(now), part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? "";
  const minute = Number(part("hour")) * 60 + Number(part("minute"));
  return parkingSchedule(lot, DAYS.indexOf(part("weekday"))).find(w => minute >= w.start && minute < w.end)?.category ?? "unknown";
}
export function parkingTime(minute: number) {
  if (minute === 1440) return "midnight";
  if (minute === 0) return "midnight";
  const hour = Math.floor(minute / 60), remainder = minute % 60;
  return `${hour % 12 || 12}${remainder ? `:${String(remainder).padStart(2, "0")}` : ""} ${hour < 12 ? "AM" : "PM"}`;
}
export function gamedayNotice(lot: ParkingLot) {
  if (lot.code === "TSL") return "Before a home football game, TPS requires this lot to be vacated by Thursday at 5:15 PM.";
  if (lot.code === "N05") return "Before a home football game, Herty Drive and Bocock Street entrances close Friday at 5:15 PM.";
  if (lot.code === "E23") return "Before a home football game, relocation starts Friday at 5:15 PM. Limited resident-permit exceptions apply only in TPS-designated areas.";
  if (lot.code === "W12") return "Before a home football game, the Auxiliary Services section must be vacated Friday by 5:15 PM; other affected sections by Saturday at 5 AM.";
  const affected = /^(N0[2-9]|N1[0-4]|S0[1-9]|S1[0-7]|S25|E0[1-4]|E0[6-9]|E1[0-2]|E20|W0[2-7]|W1[0-3]|W1[5-7])$/;
  return affected.test(lot.code) ? "Before a home football game, TPS generally requires affected areas to be vacated by Saturday at 5 AM. Lot sections and resident exceptions differ; check the official map." : "Special events can replace ordinary access rules. No event-specific permission is established here; check TPS before parking.";
}
