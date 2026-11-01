"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_PREFERENCES,
  activeNotifications,
  isNotificationEntry,
  notificationFromRow,
  preferencesFromRow,
  readDeviceNotifications,
  readDevicePreferences,
  rowFromNotification,
  rowFromPreferences,
  validatePreferences,
  writeDeviceNotifications,
  writeDevicePreferences,
  type NewNotification,
  type NotificationEntry,
  type NotificationPreferences,
} from "@/lib/notifications";
import { createClient } from "@/lib/supabase/browser-client";
import { findAccount } from "@/lib/use-classes";

export type NotificationsSource = "account" | "device";
export type NotificationsStatus = "loading" | "ready" | "error";
/** "exists" means this reminder was already created (same dedupe key), so there is nothing to do. */
export type AddResult = "created" | "exists" | "failed";

const SAVE_FAILED =
  "Your change could not be saved. Check your connection and try again.";
const DEVICE_SAVE_FAILED =
  "This browser could not save your notifications on this device.";
// Postgres "unique violation": the notifications_one_per_key rule rejected a repeat dedupe key.
const DUPLICATE_KEY = "23505";
// How often expired notifications are re-checked and hidden while the app is open.
const EXPIRY_CHECK_MS = 30_000;

// Signed-in students keep notifications and settings in Supabase (private by row-level
// security). Guests keep them on this device only, the same split as useClasses.
export function useNotifications() {
  const [all, setAll] = useState<NotificationEntry[]>([]);
  const [preferences, setPreferences] =
    useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [status, setStatus] = useState<NotificationsStatus>("loading");
  const [source, setSource] = useState<NotificationsSource>("device");
  const [accountUnavailable, setAccountUnavailable] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const account = await findAccount();
      if (cancelled) return;
      setAccountUnavailable(account.unavailable);
      if (!account.signedIn) {
        setSource("device");
        setAll(readDeviceNotifications());
        setPreferences(readDevicePreferences());
        setStatus("ready");
        return;
      }
      setSource("account");
      try {
        const client = createClient();
        // No user filter: row-level security only returns this student's rows.
        const [list, saved] = await Promise.all([
          client
            .from("notifications")
            .select("*")
            .order("created_at", { ascending: false }),
          client.from("notification_preferences").select("*").maybeSingle(),
        ]);
        if (cancelled) return;
        if (list.error || saved.error) {
          setStatus("error");
          return;
        }
        setAll(list.data.flatMap((row) => notificationFromRow(row) ?? []));
        // No row yet means this student has never changed a setting.
        setPreferences(preferencesFromRow(saved.data));
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [revision]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), EXPIRY_CHECK_MS);
    return () => clearInterval(timer);
  }, []);

  const notifications = useMemo(
    () => activeNotifications(all, now),
    [all, now],
  );
  const unreadCount = useMemo(
    () => notifications.filter((item) => item.readAt === null).length,
    [notifications],
  );

  const reload = useCallback(() => {
    setStatus("loading");
    setRevision((value) => value + 1);
  }, []);

  const fail = useCallback((message: string) => {
    setSaveError(message);
    return false;
  }, []);

  // Called by reminder delivery in the background, so failures are returned, not shown.
  const add = useCallback(
    async (draft: NewNotification): Promise<AddResult> => {
      if (source === "device") {
        const current = readDeviceNotifications();
        if (current.some((item) => item.dedupeKey === draft.dedupeKey))
          return "exists";
        const entry: NotificationEntry = {
          ...draft,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          readAt: null,
        };
        if (!isNotificationEntry(entry)) return "failed";
        const next = [entry, ...current];
        if (!writeDeviceNotifications(next)) return "failed";
        setAll(next);
        return "created";
      }
      try {
        const { data, error } = await createClient()
          .from("notifications")
          .insert(rowFromNotification(draft))
          .select()
          .single();
        if (error) return error.code === DUPLICATE_KEY ? "exists" : "failed";
        const created = notificationFromRow(data);
        if (!created) return "failed";
        setAll((current) => [created, ...current]);
        return "created";
      } catch {
        return "failed";
      }
    },
    [source],
  );

  // Only read_at is ever updated; the database refuses changes to any other column.
  const markRead = useCallback(
    async (id: string) => {
      setSaveError("");
      const readAt = new Date().toISOString();
      const mark = (item: NotificationEntry) =>
        item.id === id && item.readAt === null ? { ...item, readAt } : item;
      if (source === "device") {
        const next = readDeviceNotifications().map(mark);
        if (!writeDeviceNotifications(next)) return fail(DEVICE_SAVE_FAILED);
        setAll(next);
        return true;
      }
      try {
        const { error } = await createClient()
          .from("notifications")
          .update({ read_at: readAt })
          .eq("id", id)
          .is("read_at", null);
        if (error) return fail(SAVE_FAILED);
        setAll((current) => current.map(mark));
        return true;
      } catch {
        return fail(SAVE_FAILED);
      }
    },
    [fail, source],
  );

  const markAllRead = useCallback(async () => {
    setSaveError("");
    const readAt = new Date().toISOString();
    const mark = (item: NotificationEntry) =>
      item.readAt === null ? { ...item, readAt } : item;
    if (source === "device") {
      const next = readDeviceNotifications().map(mark);
      if (!writeDeviceNotifications(next)) return fail(DEVICE_SAVE_FAILED);
      setAll(next);
      return true;
    }
    try {
      const { error } = await createClient()
        .from("notifications")
        .update({ read_at: readAt })
        .is("read_at", null);
      if (error) return fail(SAVE_FAILED);
      setAll((current) => current.map(mark));
      return true;
    } catch {
      return fail(SAVE_FAILED);
    }
  }, [fail, source]);

  const clear = useCallback(
    async (id: string) => {
      setSaveError("");
      if (source === "device") {
        const next = readDeviceNotifications().filter((item) => item.id !== id);
        if (!writeDeviceNotifications(next)) return fail(DEVICE_SAVE_FAILED);
        setAll(next);
        return true;
      }
      try {
        const { error } = await createClient()
          .from("notifications")
          .delete()
          .eq("id", id);
        if (error) return fail(SAVE_FAILED);
        setAll((current) => current.filter((item) => item.id !== id));
        return true;
      } catch {
        return fail(SAVE_FAILED);
      }
    },
    [fail, source],
  );

  const savePreferences = useCallback(
    async (next: NotificationPreferences) => {
      setSaveError("");
      const problem = validatePreferences(next);
      if (problem) return fail(problem);
      if (source === "device") {
        if (!writeDevicePreferences(next)) return fail(DEVICE_SAVE_FAILED);
        setPreferences(next);
        return true;
      }
      try {
        // Upsert: creates the student's row the first time, updates it after that. user_id is
        // filled in by the database from the signed-in account, which is also the conflict key.
        const { error } = await createClient()
          .from("notification_preferences")
          .upsert(rowFromPreferences(next), { onConflict: "user_id" });
        if (error) return fail(SAVE_FAILED);
        setPreferences(next);
        return true;
      } catch {
        return fail(SAVE_FAILED);
      }
    },
    [fail, source],
  );

  return {
    notifications,
    unreadCount,
    preferences,
    status,
    source,
    accountUnavailable,
    saveError,
    add,
    markRead,
    markAllRead,
    clear,
    savePreferences,
    reload,
  };
}
