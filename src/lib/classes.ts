import { deviceKey } from "./device-storage";
import type { ClassEntry } from "@/app/classes/next-class";

export const MAX_MINUTES_EARLY = 60;
export const MAX_TITLE_LENGTH = 80;
export const WEEKDAY_NAMES = [
  "",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export type ClassDraft = Omit<ClassEntry, "id" | "updatedAt">;
export type ClassField =
  "title" | "buildingId" | "weekdays" | "startsAt" | "minutesEarly";
export type ClassErrors = Partial<Record<ClassField, string>>;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validateClass(draft: ClassDraft): ClassErrors {
  const errors: ClassErrors = {};
  const title = draft.title.trim();
  if (!title) errors.title = "Enter a class name.";
  else if (title.length > MAX_TITLE_LENGTH)
    errors.title = `Use ${MAX_TITLE_LENGTH} characters or fewer.`;
  if (!draft.buildingId) errors.buildingId = "Choose a campus building.";
  if (!draft.weekdays.length) errors.weekdays = "Choose at least one weekday.";
  else if (
    draft.weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)
  )
    errors.weekdays = "Choose weekdays from Monday to Sunday.";
  else if (new Set(draft.weekdays).size !== draft.weekdays.length)
    errors.weekdays = "Each weekday can be chosen once.";
  if (!TIME.test(draft.startsAt))
    errors.startsAt = "Enter a start time as HH:mm, for example 09:30.";
  if (
    !Number.isInteger(draft.minutesEarly) ||
    draft.minutesEarly < 0 ||
    draft.minutesEarly > MAX_MINUTES_EARLY
  )
    errors.minutesEarly = `Enter whole minutes from 0 to ${MAX_MINUTES_EARLY}.`;
  return errors;
}

export function describeWeekdays(weekdays: number[]) {
  return [...weekdays]
    .sort((a, b) => a - b)
    .map((day) => WEEKDAY_NAMES[day])
    .join(", ");
}

// Schedules stay in this browser and are never uploaded.
const DEVICE_KEY = "archride.classes.v1";

export function readDeviceClasses(): ClassEntry[] {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(deviceKey(DEVICE_KEY)) ?? "[]",
    );
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is ClassEntry => {
      if (!item || typeof item !== "object") return false;
      const { id, ...draft } = item as ClassEntry;
      return (
        typeof id === "string" && id.length > 0 && id.length <= 200 &&
        typeof draft.title === "string" &&
        typeof draft.buildingId === "string" && draft.buildingId.length <= 200 &&
        typeof draft.buildingName === "string" && draft.buildingName.length > 0 && draft.buildingName.length <= 200 &&
        typeof draft.startsAt === "string" && Array.isArray(draft.weekdays) &&
        typeof draft.enabled === "boolean" && typeof draft.reminderEnabled === "boolean" &&
        Object.keys(validateClass(draft)).length === 0
      );
    });
  } catch {
    return [];
  }
}

export function writeDeviceClasses(classes: ClassEntry[]) {
  try {
    localStorage.setItem(deviceKey(DEVICE_KEY), JSON.stringify(classes));
    return true;
  } catch {
    return false;
  }
}
