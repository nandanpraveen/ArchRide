import type { Database } from "@/lib/supabase/database.types";

export type NotificationType = "leave_now" | "class" | "alert" | "trip";

export type NotificationEntry = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string;
  dedupeKey: string;
  createdAt: string;
  expiresAt: string;
  readAt: string | null;
};
export type NotificationPreferences = {
  leaveNowEnabled: boolean;
  classRemindersEnabled: boolean;
  alertsEnabled: boolean;
  tripUpdatesEnabled: boolean;
  busLeadMinutes: number;
};

// What the app supplies when it creates a notification; the rest is filled in on save.
export type NewNotification = Pick<
  NotificationEntry,
  "type" | "title" | "body" | "link" | "dedupeKey" | "expiresAt"
>;

// These limits match the checks in the notifications migration.
export const MIN_BUS_LEAD_MINUTES = 1;
export const MAX_BUS_LEAD_MINUTES = 15;
export const MAX_NOTIFICATION_TITLE = 80;
export const MAX_NOTIFICATION_BODY = 200;
const NOTIFICATION_TYPES: NotificationType[] = [
  "leave_now",
  "class",
  "alert",
  "trip",
];

// Used until a signed-in student saves settings, and for guests with nothing saved yet.
export const DEFAULT_PREFERENCES: NotificationPreferences = {
  leaveNowEnabled: true,
  classRemindersEnabled: true,
  alertsEnabled: true,
  tripUpdatesEnabled: true,
  busLeadMinutes: 5,
};

export const isNotificationType = (value: unknown): value is NotificationType =>
  NOTIFICATION_TYPES.includes(value as NotificationType);
export const isValidBusLeadMinutes = (value: unknown) =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= MIN_BUS_LEAD_MINUTES &&
  value <= MAX_BUS_LEAD_MINUTES;
// In-app paths only, the same rule as the database: "/" or "/something", never "//site" or a full URL.
export const isInAppLink = (value: unknown) =>
  typeof value === "string" && /^\/([^/\\]|$)/.test(value);

// This function's only goal is to hand out a complaint if the data isn't valid
export function validatePreferences(
  preferences: NotificationPreferences,
): string | null {
  const LEAD_TIME = preferences.busLeadMinutes;
  const ERROR_MESSAGES = [
    "Choose a whole number of minutes from " +
      MIN_BUS_LEAD_MINUTES +
      " to " +
      MAX_BUS_LEAD_MINUTES +
      ".",

    "Please enter a whole number of minutes",
  ];
  if (LEAD_TIME >= MIN_BUS_LEAD_MINUTES && LEAD_TIME <= MAX_BUS_LEAD_MINUTES) {
    //Has remainder means this is decimal number
    if (isValidBusLeadMinutes(LEAD_TIME)) {
      return null;
    } else {
      return ERROR_MESSAGES[1];
    }
  } else {
    return ERROR_MESSAGES[0];
  }
}

/** Notifications still worth showing, newest first. Expired ones are hidden, not deleted. */
export function activeNotifications(
  notifications: NotificationEntry[],
  now = Date.now(),
) {
  return notifications
    .filter((item) => Date.parse(item.expiresAt) > now)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];
type NotificationInsert =
  Database["public"]["Tables"]["notifications"]["Insert"];
type PreferencesRow =
  Database["public"]["Tables"]["notification_preferences"]["Row"];
type PreferencesInsert =
  Database["public"]["Tables"]["notification_preferences"]["Insert"];

/** Returns null for a row whose type this version of the app does not know. */
export function notificationFromRow(
  row: NotificationRow,
): NotificationEntry | null {
  if (!isNotificationType(row.type)) return null;
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    dedupeKey: row.dedupe_key,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    readAt: row.read_at,
  };
}

// No user_id: the database fills it in from the signed-in account, so it cannot be spoofed.
export function rowFromNotification(
  notification: NewNotification,
): NotificationInsert {
  return {
    type: notification.type,
    title: notification.title,
    body: notification.body,
    link: notification.link,
    dedupe_key: notification.dedupeKey,
    expires_at: notification.expiresAt,
  };
}

/** A student with no saved row yet gets the defaults. */
export function preferencesFromRow(
  row: PreferencesRow | null,
): NotificationPreferences {
  if (!row) return { ...DEFAULT_PREFERENCES };
  return {
    leaveNowEnabled: row.leave_now_enabled,
    classRemindersEnabled: row.class_reminders_enabled,
    alertsEnabled: row.alerts_enabled,
    tripUpdatesEnabled: row.trip_updates_enabled,
    busLeadMinutes: row.bus_lead_minutes,
  };
}

export function rowFromPreferences(
  preferences: NotificationPreferences,
): PreferencesInsert {
  return {
    leave_now_enabled: preferences.leaveNowEnabled,
    class_reminders_enabled: preferences.classRemindersEnabled,
    alerts_enabled: preferences.alertsEnabled,
    trip_updates_enabled: preferences.tripUpdatesEnabled,
    bus_lead_minutes: preferences.busLeadMinutes,
  };
}

// Guests keep notifications and settings on this device only; they never reach Supabase.
const DEVICE_NOTIFICATIONS_KEY = "archride.notifications.v1";
const DEVICE_PREFERENCES_KEY = "archride.notification-preferences.v1";

const isText = (value: unknown, max: number, min = 0) =>
  typeof value === "string" && value.length >= min && value.length <= max;
const isTime = (value: unknown) =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

// The same rules the database enforces, for guest notifications that never reach it.
export function isNotificationEntry(item: unknown): item is NotificationEntry {
  if (!item || typeof item !== "object") return false;
  const entry = item as NotificationEntry;
  return (
    typeof entry.id === "string" &&
    isNotificationType(entry.type) &&
    isText(entry.title, MAX_NOTIFICATION_TITLE, 1) &&
    isText(entry.body, MAX_NOTIFICATION_BODY) &&
    isInAppLink(entry.link) &&
    isText(entry.dedupeKey, 200, 1) &&
    isTime(entry.createdAt) &&
    isTime(entry.expiresAt) &&
    Date.parse(entry.expiresAt) > Date.parse(entry.createdAt) &&
    (entry.readAt === null || isTime(entry.readAt))
  );
}

export function readDeviceNotifications(): NotificationEntry[] {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(DEVICE_NOTIFICATIONS_KEY) ?? "[]",
    );
    return Array.isArray(parsed) ? parsed.filter(isNotificationEntry) : [];
  } catch {
    return [];
  }
}

export function writeDeviceNotifications(notifications: NotificationEntry[]) {
  try {
    localStorage.setItem(
      DEVICE_NOTIFICATIONS_KEY,
      JSON.stringify(notifications),
    );
    return true;
  } catch {
    return false;
  }
}

/** Any setting that is missing or edited into something invalid falls back to its default. */
export function readDevicePreferences(): NotificationPreferences {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(DEVICE_PREFERENCES_KEY) ?? "{}",
    );
    if (!parsed || typeof parsed !== "object")
      return { ...DEFAULT_PREFERENCES };
    const saved = parsed as Partial<
      Record<keyof NotificationPreferences, unknown>
    >;
    const flag = (
      key: Exclude<keyof NotificationPreferences, "busLeadMinutes">,
    ) =>
      typeof saved[key] === "boolean" ? saved[key] : DEFAULT_PREFERENCES[key];
    return {
      leaveNowEnabled: flag("leaveNowEnabled"),
      classRemindersEnabled: flag("classRemindersEnabled"),
      alertsEnabled: flag("alertsEnabled"),
      tripUpdatesEnabled: flag("tripUpdatesEnabled"),
      busLeadMinutes: isValidBusLeadMinutes(saved.busLeadMinutes)
        ? (saved.busLeadMinutes as number)
        : DEFAULT_PREFERENCES.busLeadMinutes,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function writeDevicePreferences(preferences: NotificationPreferences) {
  try {
    localStorage.setItem(DEVICE_PREFERENCES_KEY, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}
