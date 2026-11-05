"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_PREFERENCES, activeNotifications, isNotificationEntry,
  readDeviceNotifications, readDevicePreferences, validatePreferences,
  writeDeviceNotifications, writeDevicePreferences,
  type NewNotification, type NotificationEntry, type NotificationPreferences,
} from "./notifications";
export type NotificationsSource = "device";
export type NotificationsStatus = "loading" | "ready" | "error";
export type AddResult = "created" | "exists" | "failed";
const CHANGED = "archride:notifications-changed";

export function useNotifications() {
  const [state, setState] = useState<{ all: NotificationEntry[]; prefs: NotificationPreferences; status: NotificationsStatus }>({ all: [], prefs: DEFAULT_PREFERENCES, status: "loading" });
  const [saveError, setSaveError] = useState(""), [now, setNow] = useState(Date.now);
  const generation = useRef(0);
  const reload = useCallback(() => {
    setNow(Date.now());
    setState({ all: readDeviceNotifications(), prefs: readDevicePreferences(), status: "ready" });
  }, []);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) reload(); });
    const timer = setInterval(() => setNow(Date.now()), 30000);
    const cleared = () => { generation.current++; reload(); };
    const storage = (event: StorageEvent) => { if (event.newValue === null) generation.current++; reload(); };
    window.addEventListener("storage", storage);
    window.addEventListener("focus", reload);
    window.addEventListener(CHANGED, reload);
    window.addEventListener("archride:device-data-cleared", cleared);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", reload);
      window.removeEventListener(CHANGED, reload);
      window.removeEventListener("archride:device-data-cleared", cleared);
    };
  }, [reload]);
  const notifications = useMemo(() => activeNotifications(state.all, now), [state.all, now]);
  const fail = useCallback((message = "This browser could not save your change. Storage may be full or blocked.") => { setSaveError(message); return false; }, []);
  const add = useCallback(async (draft: NewNotification): Promise<AddResult> => {
    if (state.status !== "ready") return "failed";
    const stamp = generation.current;
    const commit = (): AddResult => {
      if (stamp !== generation.current) return "failed";
      const entry = { ...draft, id: crypto.randomUUID(), createdAt: new Date().toISOString(), readAt: null };
      if (!isNotificationEntry(entry)) return "failed";
      const all = readDeviceNotifications();
      if (all.some((notification) => notification.dedupeKey === draft.dedupeKey)) return "exists";
      const next = [entry, ...all].slice(0, 500);
      if (!writeDeviceNotifications(next)) return "failed";
      setState((previous) => ({ ...previous, all: next }));
      window.dispatchEvent(new Event(CHANGED));
      return "created";
    };
    try { return navigator.locks ? await navigator.locks.request("archride:notifications", commit) : commit(); }
    catch { return "failed"; }
  }, [state.status]);
  const change = useCallback(async (transform: (rows: NotificationEntry[]) => NotificationEntry[]) => {
    if (state.status !== "ready") return false;
    setSaveError("");
    const stamp = generation.current;
    const commit = () => {
      if (stamp !== generation.current) return false;
      const next = transform(readDeviceNotifications());
      if (!writeDeviceNotifications(next)) return fail();
      setState((previous) => ({ ...previous, all: next }));
      window.dispatchEvent(new Event(CHANGED));
      return true;
    };
    try { return navigator.locks ? await navigator.locks.request("archride:notifications", commit) : commit(); }
    catch { return fail(); }
  }, [state.status, fail]);
  const markRead = useCallback((id: string) => {
    const readAt = new Date().toISOString();
    return change((rows) => rows.map((notification) => notification.id === id && notification.readAt === null ? { ...notification, readAt } : notification));
  }, [change]);
  const markAllRead = useCallback(() => {
    const readAt = new Date().toISOString();
    return change((rows) => rows.map((notification) => notification.readAt === null ? { ...notification, readAt } : notification));
  }, [change]);
  const clear = useCallback((id: string) => change((rows) => rows.filter((notification) => notification.id !== id)), [change]);
  const savePreferences = useCallback(async (prefs: NotificationPreferences) => {
    if (state.status !== "ready") return false;
    const problem = validatePreferences(prefs);
    if (problem) return fail(problem);
    setSaveError("");
    if (!writeDevicePreferences(prefs)) return fail("This browser could not save your settings. Storage may be full or blocked.");
    setState((previous) => ({ ...previous, prefs }));
    window.dispatchEvent(new Event(CHANGED));
    return true;
  }, [state.status, fail]);
  return {
    notifications, unreadCount: notifications.filter((notification) => notification.readAt === null).length,
    preferences: state.prefs, status: state.status, source: "device" as NotificationsSource,
    saveError, add, markRead, markAllRead, clear, savePreferences, reload,
  };
}
