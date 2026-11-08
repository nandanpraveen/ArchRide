"use client";
import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Alert, Box, Button, IconButton, Snackbar, Stack } from "@mui/material";
import CloseRounded from "@mui/icons-material/CloseRounded";
import { leaveNowReminder, type WatchedBus } from "@/lib/leave-now";
import {
  readDevicePreferences,
  type NewNotification,
} from "@/lib/notifications";
import { publicTransitClient } from "@/lib/supabase/public";
import {
  activeTransitAlerts,
  arrivalFeedConnected,
  feedFreshness,
} from "@/lib/transit/contracts";
import { useNotifications } from "@/lib/use-notifications";
import { useClasses } from "@/lib/use-classes";
import { useBrowserNotifications } from "@/lib/use-browser-notifications";
import { dueReminder, scheduledWalkReminder } from "@/lib/reminder-schedule";
import { reminderJobs } from "@/lib/class-reminders";
import { classNotification } from "@/lib/class-notification";
import { quietNow } from "@/lib/personal";
import { usePersonal } from "./personal-provider";
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
type Center = ReturnType<typeof useNotifications> & {
  browser: ReturnType<typeof useBrowserNotifications>;
  watched: WatchedBusEntry[];
  watchBus: (b: WatchedBus) => void;
  unwatchBus: (b: Pick<WatchedBus, "arrivalId" | "tripId" | "stopId">) => void;
};
const Context = createContext<Center | null>(null);
export function useNotificationCenter() {
  const value = useContext(Context);
  if (!value) throw new Error("NotificationsProvider missing");
  return value;
}
export function NotificationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const notifications = useNotifications(),
    personal = usePersonal(),
    classes = useClasses();
  const [watched, setWatched] = useState<WatchedBusEntry[]>([]),
    [banner, setBanner] = useState<NewNotification | null>(null);
  const browser = useBrowserNotifications({ ready: notifications.status === "ready" && classes.status === "ready" && personal.ready, watched, classes: classes.classes, travel: personal.prefs, active: personal.active, preferences: notifications.preferences });
  const generation = useRef(0);
  const cancelPending = useCallback(() => { generation.current++; }, []);
  const handled = useRef<HandledReminders>({}),
    checking = useRef(false);
  const latest = useRef({
    watched,
    preferences: notifications.preferences,
    travel: personal.prefs,
    classes: classes.classes,
    active: personal.active,
  });
  useLayoutEffect(() => {
    latest.current = {
      watched,
      preferences: notifications.preferences,
      travel: personal.prefs,
      classes: classes.classes,
      active: personal.active,
    };
  }, [
    watched,
    notifications.preferences,
    personal.prefs,
    classes.classes,
    personal.active,
  ]);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      const list = pruneWatched(readDeviceWatched());
      handled.current = pruneHandled(readDeviceHandled());
      setWatched((previous) =>
        JSON.stringify(previous) === JSON.stringify(list) ? previous : list,
      );
      latest.current.watched = list;
    };
    queueMicrotask(() => {
      if (active) refresh();
    });
    const cleared = () => {
      generation.current++;
      refresh();
      setBanner(null);
    };
    const storage = (event: StorageEvent) => {
      if (event.newValue === null) {
        generation.current++;
        setBanner(null);
      }
      refresh();
    };
    window.addEventListener("storage", storage);
    window.addEventListener("focus", refresh);
    window.addEventListener("archride:watched-changed", refresh);
    window.addEventListener("archride:device-data-cleared", cleared);
    return () => {
      active = false;
      cancelPending();
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("archride:watched-changed", refresh);
      window.removeEventListener("archride:device-data-cleared", cleared);
    };
  }, [cancelPending]);
  const watchBus = useCallback((bus: WatchedBus) => {
    const list = addWatched(pruneWatched(readDeviceWatched()), bus);
    writeDeviceWatched(list);
    setWatched(list);
    latest.current.watched = list;
    window.dispatchEvent(new Event("archride:watched-changed"));
  }, []);
  const unwatchBus = useCallback(
    (bus: Pick<WatchedBus, "arrivalId" | "tripId" | "stopId">) => {
      const list = removeWatched(readDeviceWatched(), bus);
      writeDeviceWatched(list);
      setWatched(list);
      latest.current.watched = list;
      window.dispatchEvent(new Event("archride:watched-changed"));
    },
    [],
  );
  const { add, status } = notifications;
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const received = (event: MessageEvent) => {
      if (event.data?.type === "archride:push" && event.data.notification) void add(event.data.notification);
    };
    navigator.serviceWorker.addEventListener("message", received);
    return () => navigator.serviceWorker.removeEventListener("message", received);
  }, [add]);
  const check = useCallback(async () => {
    const state = latest.current,
      stamp = generation.current;
    const list = pruneWatched(state.watched);
    if (list.length !== state.watched.length) {
      const current = pruneWatched(readDeviceWatched());
      writeDeviceWatched(current);
      setWatched((previous) =>
        JSON.stringify(previous) === JSON.stringify(current)
          ? previous
          : current,
      );
      latest.current.watched = current;
    }
    if (checking.current || document.hidden || quietNow(state.travel)) return;
    const db = publicTransitClient();
    if (!db) return;
    checking.current = true;
    const stillCurrent = () =>
      generation.current === stamp &&
      !document.hidden &&
      navigator.onLine &&
      latest.current.active?.expiresAt === state.active?.expiresAt &&
      latest.current.active?.step === state.active?.step &&
      !quietNow(latest.current.travel);
    async function deliver(draft: NewNotification) {
      const preferences = readDevicePreferences();
      if (
        !stillCurrent() ||
        handled.current[draft.dedupeKey] ||
        (draft.type === "leave_now" && !preferences.leaveNowEnabled) ||
        (draft.type === "class" && !preferences.classRemindersEnabled) ||
        (draft.type === "alert" && !preferences.alertsEnabled) ||
        (draft.type === "trip" && !preferences.tripUpdatesEnabled)
      )
        return;
      const result = await add(draft);
      if (!stillCurrent() || result === "failed") return;
      handled.current[draft.dedupeKey] = Date.parse(draft.expiresAt);
      writeDeviceHandled({
        ...pruneHandled(readDeviceHandled()),
        ...handled.current,
      });
      if (result === "created" && draft.type !== "alert") setBanner(draft);
    }
    try {
      handled.current = pruneHandled(handled.current);
      const walk = scheduledWalkReminder(latest.current.active, latest.current.travel.buffer);
      if (walk && dueReminder(walk)) await deliver(walk.notification);
      if (list.length) {
        const [feed, ...rows] = await Promise.all([
          db
            .from("feed_status")
            .select("*")
            .eq("id", "uga-passio:arrivals")
            .abortSignal(AbortSignal.timeout(10000))
            .maybeSingle(),
          ...list.map((b) => readWatchedArrivals(db, b)),
        ]);
        if (!stillCurrent()) return;
        const finished: WatchedBusEntry[] = [];
        for (const [i, bus] of list.entries()) {
          const clock = Date.now();
          if (
            feed.error ||
            !arrivalFeedConnected(feed.data ?? undefined, clock) ||
            !isWatched(latest.current.watched, bus) ||
            rows[i].error
          )
            continue;
          const estimate = pickWatchedEstimate(rows[i].data ?? [], clock, true),
            draft = leaveNowReminder(
              bus,
              estimate,
              latest.current.preferences,
              new Set(Object.keys(handled.current)),
              clock,
            );
          if (draft) await deliver(draft);
          if (shouldStopWatching(estimate)) finished.push(bus);
        }
        if (stillCurrent()) {
          const next = finished.reduce(
            removeWatched,
            pruneWatched(readDeviceWatched()),
          );
          writeDeviceWatched(next);
          setWatched((previous) =>
            JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
          );
          latest.current.watched = next;
        }
      }
      if (latest.current.preferences.alertsEnabled) {
        const [alerts, feed] = await Promise.all([
          db
            .from("transit_alerts")
            .select("*")
            .eq("active", true)
            .limit(100)
            .abortSignal(AbortSignal.timeout(10000)),
          db
            .from("feed_status")
            .select("*")
            .eq("id", "uga-passio:alerts")
            .abortSignal(AbortSignal.timeout(10000))
            .maybeSingle(),
        ]);
        if (
          stillCurrent() &&
          !alerts.error &&
          !feed.error &&
          feed.data &&
          feedFreshness(feed.data) === "current"
        ) {
          const active = latest.current.active;
          const activeBus =
            active?.mode === "bus" &&
            active.step < 3 &&
            Date.parse(active.expiresAt) > Date.now()
              ? active
              : null;
          const tripIds = [
            ...new Set([
              ...latest.current.watched.map((b) => b.tripId),
              ...(activeBus?.tripId ? [activeBus.tripId] : []),
            ]),
          ];
          const trips = tripIds.length
            ? await db
                .from("transit_trips")
                .select("route_id")
                .in("id", tripIds)
                .limit(10)
                .abortSignal(AbortSignal.timeout(10000))
            : { data: [], error: null };
          const routeIds = new Set(
            (trips.data ?? []).map((t) =>
              t.route_id.replace(/^uga-passio:/, ""),
            ),
          );
          const stopIds = new Set(
            [
              ...latest.current.watched.map((bus) => bus.stopId),
              activeBus?.boarding?.id,
              activeBus?.alighting?.id,
            ]
              .filter((id): id is string => !!id)
              .flatMap((id) => [id, id.replace(/^uga-passio:/, "")]),
          );
          for (const alert of activeTransitAlerts(alerts.data ?? [])) {
            const entities = Array.isArray(alert.informed_entities)
              ? alert.informed_entities
              : [];
            const relevant =
              !entities.length ||
              entities.some((entity) => {
                if (
                  !entity ||
                  typeof entity !== "object" ||
                  Array.isArray(entity)
                )
                  return false;
                const trip =
                  entity.trip &&
                  typeof entity.trip === "object" &&
                  !Array.isArray(entity.trip)
                    ? entity.trip
                    : null;
                return (
                  (!entity.routeId || routeIds.has(String(entity.routeId))) &&
                  (!entity.stopId || stopIds.has(String(entity.stopId))) &&
                  (!trip?.tripId ||
                    tripIds.some((id) =>
                      [id, id.replace(/^uga-passio:/, "")].includes(
                        String(trip.tripId),
                      ),
                    ))
                );
              });
            if (!relevant || trips.error) continue;
            const revision = await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(
                JSON.stringify([
                  alert.id,
                  alert.header,
                  alert.description,
                  alert.active_periods,
                  alert.informed_entities,
                ]),
              ),
            );
            const revisionKey = Array.from(new Uint8Array(revision), (byte) =>
              byte.toString(16).padStart(2, "0"),
            ).join("");
            const end = (
              Array.isArray(alert.active_periods) ? alert.active_periods : []
            ).flatMap((p) =>
              p &&
              typeof p === "object" &&
              !Array.isArray(p) &&
              Number.isFinite(Number(p.end)) &&
              Number(p.end) > Date.now() / 1000
                ? [Number(p.end) * 1000]
                : [],
            );
            await deliver({
              type: "alert",
              title: alert.header.slice(0, 80) || "Campus service alert",
              body: alert.description.slice(0, 200),
              link: "/map",
              dedupeKey: `alert:${alert.id.slice(0, 100)}:${revisionKey}`,
              expiresAt: new Date(
                Math.min(Date.now() + 6 * 3600000, ...end),
              ).toISOString(),
            });
          }
        }
      }
      if (latest.current.preferences.classRemindersEnabled) {
        const jobs = reminderJobs(latest.current.classes, Date.now()).slice(
          0,
          12,
        );
        for (const job of jobs) {
          if (!stillCurrent()) return;
          let walking: number | null = null;
          const travel = latest.current.travel;
          if (travel.defaultOrigin) {
            const r = await db
              .from("transit_walking_cache")
              .select("duration_seconds")
              .eq("origin_id", travel.defaultOrigin.id)
              .eq("destination_id", job.buildingId)
              .eq("profile", "foot")
              .gt("expires_at", new Date().toISOString())
              .order("fetched_at", { ascending: false })
              .limit(1)
              .abortSignal(AbortSignal.timeout(10000))
              .maybeSingle();
            if (!r.error && r.data)
              walking = Math.ceil(
                (r.data.duration_seconds * 1.34) / travel.walkingSpeed,
              );
          }
          if (
            !reminderJobs(latest.current.classes, Date.now()).some(
              (j) => j.jobKey === job.jobKey,
            )
          )
            continue;
          const draft = classNotification(job, travel, walking, Date.now());
          if (draft) await deliver(draft);
        }
      }
    } catch {
      /* Recheck on the next visible tick. Failed reads never create inferred reminders. */
    } finally {
      checking.current = false;
    }
  }, [add]);
  useEffect(() => {
    if (status !== "ready" || classes.status !== "ready" || !personal.ready)
      return;
    let active = true;
    queueMicrotask(() => {
      if (active) void check();
    });
    const t = setInterval(() => void check(), 30000),
      visible = () => {
        if (!document.hidden) void check();
      };
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [check, status, classes.status, personal.ready, personal.active, watched]);
  const value = useMemo(
    () => ({ ...notifications, browser, watched, watchBus, unwatchBus }),
    [notifications, browser, watched, watchBus, unwatchBus],
  );
  return (
    <Context.Provider value={value}>
      {children}
      {banner && (
        <Snackbar
          open
          autoHideDuration={12000}
          onClose={() => setBanner(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
          sx={{
            bottom: { xs: "calc(80px + env(safe-area-inset-bottom))", md: 24 },
            width: {
              xs: "calc(100% - 16px)",
              sm: "min(560px, calc(100% - 48px))",
            },
          }}
        >
          <Alert
            severity={banner.type === "trip" ? "warning" : "info"}
            variant="filled"
            onClose={() => setBanner(null)}
            sx={{
              width: "100%",
              minWidth: 0,
              alignItems: "flex-start",
              "& .MuiAlert-message": { minWidth: 0 },
              "& .MuiAlert-action": {
                p: 0,
                m: 0,
                ml: 1,
                alignSelf: "flex-start",
              },
            }}
            action={
              <Stack direction={{ xs: "column", sm: "row" }} spacing={0.5}>
                <Button
                  color="inherit"
                  component={Link}
                  href={banner.link}
                  onClick={() => setBanner(null)}
                  sx={{ minWidth: 0, px: 1.5 }}
                >
                  Open
                </Button>
                <IconButton
                  color="inherit"
                  aria-label="Dismiss notification"
                  onClick={() => setBanner(null)}
                >
                  <CloseRounded />
                </IconButton>
              </Stack>
            }
          >
            <Box
              component="strong"
              sx={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                overflowWrap: "anywhere",
              }}
            >
              {banner.title}
            </Box>
            <Box
              component="span"
              sx={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                overflowWrap: "anywhere",
              }}
            >
              {banner.body}
            </Box>
          </Alert>
        </Snackbar>
      )}
    </Context.Provider>
  );
}
