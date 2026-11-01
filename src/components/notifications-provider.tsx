"use client";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Snackbar } from "@mui/material";
import { leaveNowReminder, type WatchedBus } from "@/lib/leave-now";
import type { NewNotification } from "@/lib/notifications";
import { publicTransitClient } from "@/lib/supabase/public";
import { arrivalFeedConnected } from "@/lib/transit/contracts";
import { useNotifications } from "@/lib/use-notifications";
import {
  addWatched,
  isWatched,
  pickWatchedEstimate,
  pruneHandled,
  pruneWatched,
  readDeviceHandled,
  readDeviceWatched,
  readWatchedArrivals,
  removeWatched,
  shouldStopWatching,
  writeDeviceHandled,
  writeDeviceWatched,
  type HandledReminders,
  type WatchedBusEntry,
} from "@/lib/watched-buses";

// Reminders are checked while ArchRide is open: once a minute and whenever the tab comes back into view.
const CHECK_EVERY_MS = 60_000;
const BANNER_MS = 15_000;
const ARRIVALS_FEED = "uga-passio:arrivals";

type NotificationCenter = ReturnType<typeof useNotifications> & {
  watched: WatchedBusEntry[];
  watchBus: (bus: WatchedBus) => void;
  unwatchBus: (bus: Pick<WatchedBus, "arrivalId" | "tripId" | "stopId">) => void;
};

const NotificationsContext = createContext<NotificationCenter | null>(null);

export function useNotificationCenter() {
  const center = useContext(NotificationsContext);
  if (!center) throw new Error("useNotificationCenter must be used inside NotificationsProvider.");
  return center;
}

// One shared copy of the student's notifications, so the bell, the Notifications page and the
// reminder timer all see the same list. It also runs the timer that creates leave-now reminders.
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const notifications = useNotifications();
  const { add, preferences, status } = notifications;
  const [watched, setWatched] = useState<WatchedBusEntry[]>([]);
  const [banner, setBanner] = useState<NewNotification | null>(null);
  const latest = useRef({ watched, preferences });
  const handled = useRef<HandledReminders>({});
  const checking = useRef(false);

  useEffect(() => {
    latest.current = { watched, preferences };
  }, [watched, preferences]);

  // Read after mount, not during render, so the first render matches the server's.
  useEffect(() => {
    const stored = pruneWatched(readDeviceWatched());
    handled.current = pruneHandled(readDeviceHandled());
    queueMicrotask(() => setWatched(stored));
  }, []);

  const watchBus = useCallback((bus: WatchedBus) => {
    const next = addWatched(pruneWatched(readDeviceWatched()), bus);
    writeDeviceWatched(next);
    latest.current.watched = next;
    setWatched(next);
  }, []);

  const unwatchBus = useCallback((bus: Pick<WatchedBus, "arrivalId" | "tripId" | "stopId">) => {
    const next = removeWatched(readDeviceWatched(), bus);
    writeDeviceWatched(next);
    latest.current.watched = next;
    setWatched(next);
  }, []);

  const check = useCallback(async () => {
    if (checking.current) return;
    const list = pruneWatched(latest.current.watched);
    if (list.length !== latest.current.watched.length) {
      latest.current.watched = list;
      writeDeviceWatched(list);
      setWatched(list);
    }
    const db = publicTransitClient();
    if (!list.length || !db) return;
    checking.current = true;
    try {
      const [feed, ...arrivals] = await Promise.all([
        db.from("feed_status").select("*").eq("id", ARRIVALS_FEED).abortSignal(AbortSignal.timeout(10_000)).maybeSingle(),
        ...list.map((bus) => readWatchedArrivals(db, bus)),
      ]);
      // If the arrival feed cannot be read, every prediction counts as stale and nothing is sent.
      handled.current = pruneHandled(handled.current);
      const finished: WatchedBusEntry[] = [];
      for (const [index, bus] of list.entries()) {
        // Network requests may have taken time or the student may have changed this watch/settings.
        const clock = Date.now();
        const connected = !feed.error && arrivalFeedConnected(feed.data ?? undefined, clock);
        if (!connected || !isWatched(pruneWatched(latest.current.watched, clock), bus)) continue;
        const rows = arrivals[index];
        if (rows.error) continue;
        const estimate = pickWatchedEstimate(rows.data, clock, connected);
        const reminder = leaveNowReminder(bus, estimate, latest.current.preferences, new Set(Object.keys(handled.current)), clock);
        let delivered = true;
        if (reminder) {
          const result = await add(reminder);
          delivered = result !== "failed";
          if (delivered) {
            handled.current[reminder.dedupeKey] = Date.parse(reminder.expiresAt);
            writeDeviceHandled(handled.current);
          }
          if (result === "created") setBanner(reminder);
        }
        if (delivered && shouldStopWatching(estimate)) finished.push(bus);
      }
      if (finished.length) {
        const next = finished.reduce(removeWatched, readDeviceWatched());
        writeDeviceWatched(next);
        setWatched(next);
      }
    } catch {
      // A failed check is simply tried again at the next one.
    } finally {
      checking.current = false;
    }
  }, [add]);

  useEffect(() => {
    // Wait until the right place to save (account or this device) is known.
    if (status !== "ready") return;
    void check();
    const timer = setInterval(() => void check(), CHECK_EVERY_MS);
    const visibilityChanged = () => {
      if (!document.hidden) void check();
    };
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [check, status, watched]);

  const value = useMemo(
    () => ({ ...notifications, watched, watchBus, unwatchBus }),
    [notifications, watched, watchBus, unwatchBus],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      {banner && (
        <Snackbar
          open
          autoHideDuration={BANNER_MS}
          onClose={(_, reason) => {
            if (reason !== "clickaway") setBanner(null);
          }}
          anchorOrigin={{ vertical: "top", horizontal: "center" }}
        >
          <Alert
            severity={banner.dedupeKey.startsWith("cancel:") ? "warning" : "info"}
            variant="filled"
            onClose={() => setBanner(null)}
            action={
              <Button color="inherit" size="small" component={Link} href="/notifications" onClick={() => setBanner(null)}>
                View
              </Button>
            }
          >
            <strong>{banner.title}</strong> {banner.body}
          </Alert>
        </Snackbar>
      )}
    </NotificationsContext.Provider>
  );
}
