import { isWatchedEntry, pruneWatched, pickWatchedEstimate, type WatchedBusEntry } from "./watched-buses";
import { leaveNowReminder } from "./leave-now";
import { arrivalFeedConnected, type Arrival, type FeedHealth } from "./transit/contracts";
import { isValidBusLeadMinutes, type NewNotification, type NotificationPreferences } from "./notifications";
import { quietNow } from "./personal";
import { dueReminder, validScheduledReminder, type ScheduledReminder } from "./reminder-schedule";

export type PushState = {
  watched: WatchedBusEntry[];
  scheduled: ScheduledReminder[];
  preferences: NotificationPreferences;
  quietStart: string;
  quietEnd: string;
};
export type BrowserSubscription = { endpoint: string; keys: { auth: string; p256dh: string } };

export function validSubscription(value: unknown): value is BrowserSubscription {
  if (!value || typeof value !== "object") return false;
  const sub = value as BrowserSubscription;
  try {
    const url = new URL(sub.endpoint);
    // Do not let a public subscription endpoint turn the sender into an HTTP proxy.
    const host = url.hostname;
    return sub.endpoint.length <= 2048 && url.protocol === "https:" && !url.username && !url.password && !url.port &&
      (host === "fcm.googleapis.com" || host === "updates.push.services.mozilla.com" || host.endsWith(".push.services.mozilla.com") || host === "web.push.apple.com" || host.endsWith(".push.apple.com") || host.endsWith(".notify.windows.com")) &&
      /^[A-Za-z0-9_-]{22}$/.test(sub.keys.auth) && /^[A-Za-z0-9_-]{87}$/.test(sub.keys.p256dh);
  } catch { return false; }
}

export function validPushState(value: unknown, now = Date.now()): value is PushState {
  if (!value || typeof value !== "object") return false;
  const state = value as PushState;
  const prefs = state.preferences;
  const time = (s: unknown) => s === "" || typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  return !!prefs && [prefs.leaveNowEnabled, prefs.classRemindersEnabled, prefs.alertsEnabled, prefs.tripUpdatesEnabled].every(v => typeof v === "boolean") &&
    isValidBusLeadMinutes(prefs.busLeadMinutes) && time(state.quietStart) && time(state.quietEnd) &&
    Array.isArray(state.watched) && state.watched.length <= 5 && state.watched.every(watch => isWatchedEntry(watch, now)) &&
    Array.isArray(state.scheduled) && state.scheduled.length <= 64 && state.scheduled.every(job => validScheduledReminder(job, now));
}

export function pushRemindersDue(state: PushState, arrivals: Arrival[], feed: FeedHealth | null, handled: Record<string, number>, now = Date.now()): NewNotification[] {
  if (quietNow(state, now)) return [];
  const keys = new Set(Object.entries(handled).filter(([, expiry]) => expiry > now).map(([key]) => key));
  const drafts: NewNotification[] = [];
  const append = (draft: NewNotification | null) => {
    if (!draft || keys.has(draft.dedupeKey)) return;
    drafts.push(draft);
    keys.add(draft.dedupeKey);
  };
  if (arrivalFeedConnected(feed ?? undefined, now)) {
    for (const watch of pruneWatched(state.watched, now)) {
      const rows = arrivals.filter(row => row.id === watch.arrivalId && row.trip_id === watch.tripId && row.stop_id === watch.stopId && row.provenance === "source");
      append(leaveNowReminder(watch, pickWatchedEstimate(rows, now, true), state.preferences, keys, now));
    }
  }
  for (const job of state.scheduled) {
    const draft = job.notification;
    if ((draft.type === "class" ? state.preferences.classRemindersEnabled : state.preferences.leaveNowEnabled) && dueReminder(job, now)) append(draft);
  }
  return drafts;
}
