import type { ClassEntry } from "@/app/classes/next-class";
import type { Database } from "@/lib/supabase/database.types";

export const MAX_MINUTES_EARLY = 60;
export const MAX_TITLE_LENGTH = 80;
export const WEEKDAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export type ClassDraft = Omit<ClassEntry, "id">;
export type ClassField = "title" | "buildingId" | "weekdays" | "startsAt" | "minutesEarly";
export type ClassErrors = Partial<Record<ClassField, string>>;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const isValidStartTime = (value: unknown) => typeof value === "string" && TIME.test(value);
export const isValidMinutesEarly = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_MINUTES_EARLY;

export function validateClass(draft: ClassDraft): ClassErrors {
  const errors: ClassErrors = {};
  const title = draft.title.trim();
  if (!title) errors.title = "Enter a class name.";
  else if (title.length > MAX_TITLE_LENGTH) errors.title = `Use ${MAX_TITLE_LENGTH} characters or fewer.`;
  if (!draft.buildingId) errors.buildingId = "Choose a campus building.";
  if (!draft.weekdays.length) errors.weekdays = "Choose at least one weekday.";
  else if (draft.weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) errors.weekdays = "Choose weekdays from Monday to Sunday.";
  else if (new Set(draft.weekdays).size !== draft.weekdays.length) errors.weekdays = "Each weekday can be chosen once.";
  if (!TIME.test(draft.startsAt)) errors.startsAt = "Enter a start time as HH:mm, for example 09:30.";
  if (!Number.isInteger(draft.minutesEarly) || draft.minutesEarly < 0 || draft.minutesEarly > MAX_MINUTES_EARLY)
    errors.minutesEarly = `Enter whole minutes from 0 to ${MAX_MINUTES_EARLY}.`;
  return errors;
}

export function describeWeekdays(weekdays: number[]) {
  return [...weekdays].sort((a, b) => a - b).map((day) => WEEKDAY_NAMES[day]).join(", ");
}

type ClassRow = Database["public"]["Tables"]["classes"]["Row"];
type ClassInsert = Database["public"]["Tables"]["classes"]["Insert"];

export function classFromRow(row: ClassRow): ClassEntry {
  return {
    id: row.id,
    title: row.title,
    weekdays: [...row.weekdays].sort((a, b) => a - b),
    startsAt: row.starts_at,
    enabled: row.enabled,
    buildingId: row.building_id,
    buildingName: row.building_name,
    minutesEarly: row.minutes_early,
    reminderEnabled: row.reminder_enabled,
  };
}

export function rowFromDraft(draft: ClassDraft): ClassInsert {
  return {
    title: draft.title.trim(),
    weekdays: [...draft.weekdays].sort((a, b) => a - b),
    starts_at: draft.startsAt,
    enabled: draft.enabled,
    building_id: draft.buildingId,
    building_name: draft.buildingName,
    minutes_early: draft.minutesEarly,
    reminder_enabled: draft.reminderEnabled,
  };
}

// Guests keep their schedule on this device only; it never reaches Supabase.
const DEVICE_KEY = "archride.classes.v1";

export function readDeviceClasses(): ClassEntry[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(DEVICE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is ClassEntry => {
      if (!item || typeof item !== "object") return false;
      const { id, ...draft } = item as ClassEntry;
      return typeof id === "string" && Object.keys(validateClass(draft)).length === 0;
    });
  } catch {
    return [];
  }
}

export function writeDeviceClasses(classes: ClassEntry[]) {
  try {
    localStorage.setItem(DEVICE_KEY, JSON.stringify(classes));
    return true;
  } catch {
    return false;
  }
}
