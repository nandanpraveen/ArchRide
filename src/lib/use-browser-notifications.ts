"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ClassEntry } from "@/app/classes/next-class";
import type { ActiveTrip, TravelPreferences } from "./personal";
import type { NotificationPreferences } from "./notifications";
import type { WatchedBusEntry } from "./watched-buses";
import type { PushState } from "./push-reminders";
import { browserPushSupport, disableBrowserPush, enableBrowserPush, readPushDevice, syncBrowserPush } from "./browser-push";
import { reminderJobs } from "./class-reminders";
import { scheduledClassReminder, scheduledWalkReminder, validScheduledReminder } from "./reminder-schedule";
import { publicTransitClient } from "./supabase/public";

type Input = { ready: boolean; watched: WatchedBusEntry[]; classes: ClassEntry[]; travel: TravelPreferences; active: ActiveTrip | null; preferences: NotificationPreferences };
export function useBrowserNotifications(input: Input) {
  const [support, setSupport] = useState<ReturnType<typeof browserPushSupport> | "loading">("loading");
  const [enabled, setEnabled] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [syncedAt, setSyncedAt] = useState<string>();
  const retryAction = useRef<"enable" | "disable" | "sync">("enable");
  const latest = useRef(input);
  useEffect(() => { latest.current = input; }, [input]);
  useEffect(() => {
    const refresh = () => {
      setSupport(browserPushSupport());
      setPermission("Notification" in window ? Notification.permission : "default");
      const device = readPushDevice();
      setEnabled(!!device?.enabled && "Notification" in window && Notification.permission === "granted");
      setSyncedAt(device?.syncedAt);
    };
    queueMicrotask(refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("archride:push-changed", refresh);
    return () => { window.removeEventListener("focus", refresh); window.removeEventListener("storage", refresh); window.removeEventListener("archride:push-changed", refresh); };
  }, []);
  const snapshot = useCallback(async (): Promise<PushState> => {
    const state = latest.current;
    const jobs = reminderJobs(state.classes, Date.now()).slice(0, 63);
    const durations = new Map<string, number>();
    const db = publicTransitClient(), origin = state.travel.defaultOrigin;
    if (db && origin && jobs.length) {
      const result = await db.from("transit_walking_cache").select("destination_id,duration_seconds")
        .eq("origin_id", origin.id).in("destination_id", [...new Set(jobs.map(job => job.buildingId))])
        .eq("profile", "foot").gt("expires_at", new Date().toISOString()).order("fetched_at", { ascending: false })
        .limit(100).abortSignal(AbortSignal.timeout(10000));
      for (const row of result.data ?? []) if (!durations.has(row.destination_id)) durations.set(row.destination_id, Math.ceil(row.duration_seconds * 1.34 / state.travel.walkingSpeed));
    }
    const scheduled = jobs.map(job => scheduledClassReminder(job, state.travel, durations.get(job.buildingId) ?? null));
    const walk = scheduledWalkReminder(state.active, state.travel.buffer);
    if (walk) scheduled.unshift(walk);
    return { watched: state.watched, scheduled: scheduled.filter(job => validScheduledReminder(job)), preferences: state.preferences, quietStart: state.travel.quietStart, quietEnd: state.travel.quietEnd };
  }, []);
  useEffect(() => {
    if (!input.ready || !enabled) return;
    let active = true;
    const sync = async () => {
      try {
        const state = await snapshot();
        if (!active) return;
        await syncBrowserPush(state);
        if (active) setError("");
      } catch (problem) { if (active) { retryAction.current = "sync"; setError(problem instanceof Error ? problem.message : "Couldn’t update browser reminders. Retry in Profile."); } }
    };
    const delay = setTimeout(() => void sync(), 500);
    const timer = setInterval(() => void sync(), 60000);
    const online = () => void sync();
    window.addEventListener("online", online);
    return () => { active = false; clearTimeout(delay); clearInterval(timer); window.removeEventListener("online", online); };
  }, [input.ready, input.watched, input.classes, input.travel, input.active, input.preferences, enabled, snapshot]);
  const enable = async () => {
    if (support !== "supported" || busy) return;
    // This call must happen directly in the click handler, before any awaited work.
    const request = Notification.requestPermission();
    retryAction.current = "enable";
    setBusy(true); setError("");
    try { const permission = await request; if (permission !== "granted") throw new Error("Notifications are blocked. Allow ArchRide in your browser’s site settings, then retry."); const state = await snapshot(); await enableBrowserPush(state, Promise.resolve(permission)); }
    catch (problem) { setError(problem instanceof Error ? problem.message : "Couldn’t enable notifications. Retry."); }
    finally { setBusy(false); setPermission(Notification.permission); }
  };
  const disable = async () => {
    retryAction.current = "disable";
    setBusy(true); setError("");
    try { await disableBrowserPush(); }
    catch (problem) { setError(problem instanceof Error ? problem.message : "Couldn’t turn off notifications. Retry."); }
    finally { setBusy(false); }
  };
  const retry = async () => {
    if (retryAction.current === "enable") return enable();
    if (retryAction.current === "disable") return disable();
    setBusy(true);
    try { await syncBrowserPush(await snapshot()); setError(""); }
    catch (problem) { setError(problem instanceof Error ? problem.message : "Couldn’t update reminders. Retry."); }
    finally { setBusy(false); }
  };
  return { support, enabled, busy, permission, error, syncedAt, enable, disable, retry };
}
