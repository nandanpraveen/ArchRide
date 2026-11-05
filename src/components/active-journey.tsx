"use client";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { usePersonal } from "./personal-provider";
import { useNotificationCenter } from "./notifications-provider";
import { AgencyAlert } from "./agency-alert";
import { ManualNotices } from "./manual-notices";
import { useArrivalClock } from "./arrival-status";
import {
  activeTripTiming,
  mergeActiveArrivals,
  relevantTripAlerts,
} from "@/lib/active-trip";
import { arrivalFeedConnected, type Arrival } from "@/lib/transit/contracts";
import type { PublicTransitData } from "@/lib/transit/public-data";
import { publicTransitClient } from "@/lib/supabase/public";
import { planRefHref, quietNow } from "@/lib/personal";

const time = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(Date.parse(value));
const assessmentLabels = {
  on_time: "On time",
  tight: "Tight timing",
  likely_late: "Likely late",
  insufficient: "Timing unavailable",
};

export function ActiveJourney({
  transit,
  onRefresh,
  onRecovery,
  onFinish,
}: {
  transit: PublicTransitData | null;
  onRefresh: () => void;
  onRecovery: (missed: boolean) => void;
  onFinish: () => void;
}) {
  const personal = usePersonal(),
    center = useNotificationCenter(),
    trip = personal.active;
  const now = useArrivalClock();
  const identity = `${personal.scope}:${trip?.expiresAt}:${trip?.instanceKey}`;
  const [snapshot, setSnapshot] = useState<{
    identity: string;
    rows: Arrival[];
    failed: boolean;
    loading: boolean;
  }>({ identity: "", rows: [], failed: false, loading: true });
  const [online, setOnline] = useState(true);
  const [revision, setRevision] = useState(0);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const notificationAttempts = useRef(
    new Map<string, { count: number; at: number }>(),
  );
  const busActive =
    trip?.mode === "bus" && trip.step < 3 && Date.parse(trip.expiresAt) > now;
  const instance = trip?.instanceKey,
    tripId = trip?.tripId;
  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) setRevision((n) => n + 1);
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    update();
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    if (!busActive || !instance) return;
    const db = publicTransitClient();
    if (!db) return;
    let disposed = false,
      running = false;
    let request: AbortController | null = null;
    async function refresh() {
      if (running || disposed || document.hidden || !navigator.onLine) return;
      running = true;
      request = new AbortController();
      try {
        let read = db!
          .from("transit_arrivals")
          .select("*")
          .eq("instance_key", instance!)
          .eq("provenance", "source");
        if (tripId) read = read.eq("trip_id", tripId);
        const result = await read
          .order("id")
          .limit(100)
          .abortSignal(
            AbortSignal.any([request.signal, AbortSignal.timeout(10000)]),
          );
        if (result.error || result.data.length === 100)
          throw new Error("Arrival refresh unavailable");
        if (!disposed && !request.signal.aborted)
          setSnapshot((previous) => ({
            identity,
            rows: mergeActiveArrivals(
              previous.identity === identity ? previous.rows : [],
              result.data,
            ),
            failed: false,
            loading: false,
          }));
      } catch {
        if (!disposed && !request?.signal.aborted)
          setSnapshot((previous) => ({
            identity,
            rows: previous.identity === identity ? previous.rows : [],
            failed: true,
            loading: false,
          }));
      } finally {
        running = false;
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 10000);
    const visible = () => {
      if (document.hidden) request?.abort();
      else void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      disposed = true;
      request?.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [busActive, identity, instance, tripId, revision]);
  const current = snapshot.identity === identity ? snapshot : null;
  const connected =
    online &&
    !current?.failed &&
    arrivalFeedConnected(
      transit?.health.find((feed) => feed.id === "uga-passio:arrivals"),
      now,
    );
  const timing = trip
    ? activeTripTiming(
        trip,
        current?.rows ?? [],
        connected,
        personal.prefs.buffer * 60,
        now,
      )
    : null;
  const event =
    timing?.state === "cancelled"
      ? "cancelled"
      : timing?.state === "unreachable"
        ? "unreachable"
        : timing?.changeMinutes != null
          ? timing.changeMinutes > 0
            ? "later"
            : "earlier"
          : null;
  const addNotification = center.add,
    notificationReady = center.status === "ready",
    updatesEnabled = center.preferences.tripUpdatesEnabled;
  const notificationKey =
    trip && event
      ? `active:${(trip.tripId ?? trip.instanceKey ?? "walk").slice(0, 80)}:${trip.boardingSequence}:${trip.selectedBoardingAt ?? trip.expiresAt}:${event}`
      : null;
  useEffect(() => {
    if (
      !notificationKey ||
      !trip ||
      !timing ||
      !event ||
      !notificationReady ||
      !updatesEnabled ||
      quietNow(personal.prefs)
    )
      return;
    const key = `${personal.scope}:${notificationKey}`,
      previous = notificationAttempts.current.get(key);
    if (previous && (previous.count >= 3 || Date.now() - previous.at < 30000))
      return;
    notificationAttempts.current.set(key, {
      count: (previous?.count ?? 0) + 1,
      at: Date.now(),
    });
    void addNotification({
      type: "trip",
      title:
        event === "cancelled"
          ? "Your trip needs attention"
          : "Trip timing changed",
      body: (event === "cancelled" || event === "unreachable"
        ? timing.reason
        : "Your destination arrival estimate changed by at least two minutes. Review the updated timing or compare alternatives."
      ).slice(0, 200),
      link: "/plan",
      dedupeKey: notificationKey,
      expiresAt: new Date(
        Math.min(Date.parse(trip.expiresAt), Date.now() + 30 * 60000),
      ).toISOString(),
    }).then((result) => {
      if (result !== "failed")
        notificationAttempts.current.set(key, { count: 3, at: Date.now() });
    });
    // The deterministic key deduplicates the same event across refreshes and devices.
  }, [
    notificationKey,
    notificationReady,
    updatesEnabled,
    addNotification,
    trip,
    event,
    timing,
    personal.prefs,
    personal.scope,
  ]);
  useEffect(() => {
    if (!trip) return;
    const ownWatches = center.watched.filter(
      (watch) => watch.activeTrip && watch.instanceKey === trip.instanceKey,
    );
    if (trip.step >= 2 || Date.parse(trip.expiresAt) <= now) {
      for (const watch of ownWatches) center.unwatchBus(watch);
      return;
    }
    const row = current?.rows.find(
      (arrival) =>
        arrival.instance_key === trip.instanceKey &&
        arrival.trip_id === trip.tripId &&
        arrival.stop_id === trip.boarding?.id &&
        arrival.stop_sequence === trip.boardingSequence,
    );
    if (!row || timing?.state !== "live" || !trip.boarding) return;
    const walking = trip.step === 1 ? 0 : (trip.walkToSeconds ?? 0);
    const safety = trip.step === 1 ? 0 : personal.prefs.buffer * 60;
    const watch = ownWatches.find((watch) => watch.arrivalId === row.id);
    if (watch?.walkSeconds === walking && watch.safetySeconds === safety)
      return;
    for (const old of ownWatches) center.unwatchBus(old);
    center.watchBus({
      activeTrip: true,
      instanceKey: row.instance_key,
      arrivalId: row.id,
      tripId: row.trip_id,
      stopId: row.stop_id,
      routeName: trip.routeName || "Your bus",
      stopName: trip.boarding.name,
      walkSeconds: walking,
      safetySeconds: safety,
      planLink:
        planRefHref(trip.origin, trip.destination) +
        (trip.deadline ? `&deadline=${encodeURIComponent(trip.deadline)}` : ""),
    });
  }, [trip, now, current?.rows, timing?.state, center, personal.prefs.buffer]);
  if (!trip || !timing) return null;
  const bus = trip.mode === "bus",
    steps = bus
      ? [
          "Walk to boarding stop",
          "Wait and board",
          "Ride the bus",
          "Walk to destination",
          "Arrive",
        ]
      : ["Walk to destination", "Arrive"];
  const stage = Math.min(trip.step, steps.length - 1);
  const actions = bus
    ? ["I’m at the stop", "I boarded", "I got off", "I’ve arrived"]
    : ["I’ve arrived"];
  const route = transit?.routes.find((route) => route.id === timing.routeId);
  const stops =
    transit?.stops.filter((stop) =>
      [trip.boarding?.id, trip.alighting?.id].includes(stop.id),
    ) ?? [];
  const alerts = relevantTripAlerts(
    transit?.alerts ?? [],
    route,
    stops,
    trip.tripId,
    now,
  );
  const attentionKey = `${identity}:${event ?? timing.state}`;
  const attention =
    event || ["stale", "missing", "passed", "expired"].includes(timing.state);
  const clearWatches = () => {
    for (const watch of center.watched)
      if (watch.activeTrip && watch.instanceKey === trip.instanceKey)
        center.unwatchBus(watch);
  };
  async function finish(arrived: boolean) {
    if (await personal.setActive(null)) {
      clearWatches();
      if (arrived) onFinish();
    }
  }
  return (
    <Paper
      variant="outlined"
      component="section"
      aria-label="Active trip"
      sx={{
        p: { xs: 2, sm: 3 },
        borderColor: "divider",
        borderLeft: "3px solid",
        borderLeftColor: "primary.main",
        borderRadius: "12px",
      }}
    >
      <Stack spacing={2}>
        <Stack
          direction="row"
          sx={{ justifyContent: "space-between", alignItems: "center", gap: 1 }}
        >
          <Chip
            label={
              timing.state === "expired" ? "Trip expired" : "Trip in progress"
            }
            size="small"
            color="primary"
          />
          <Typography variant="caption" color="text.secondary">
            Step {stage + 1} of {steps.length}
          </Typography>
        </Stack>
        <Box>
          <Typography component="h2" variant="h2">
            {steps[stage]}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            {bus && stage <= 1
              ? `${trip.boarding?.name ?? "Your boarding stop"}. ${trip.routeName} toward ${trip.headsign}.`
              : bus && stage === 2
                ? `${trip.routeName} toward ${trip.headsign}. Exit at ${trip.alighting?.name ?? "your selected stop"}.`
                : trip.destination.name}
          </Typography>
          {(bus || trip.deadline) && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Destination: {trip.destination.name}
              {trip.deadline
                ? `. Arrive by ${time(trip.deadline)} campus time.`
                : "."}
            </Typography>
          )}
        </Box>
        {snapshot.identity !== identity && busActive && (
          <Typography role="status" variant="body2">
            Rechecking your selected bus and stop occurrences…
          </Typography>
        )}
        {!online && (
          <Alert severity="warning">
            You are offline. Your trip steps are available, but current transit
            timing cannot be verified.
          </Alert>
        )}
        {attention && !dismissed.includes(attentionKey) && (
          <Alert
            severity={
              timing.state === "cancelled" || timing.state === "expired"
                ? "warning"
                : "info"
            }
            onClose={() => setDismissed((items) => [...items, attentionKey])}
          >
            {event === "earlier" || event === "later"
              ? `Estimated destination arrival is ${Math.abs(timing.changeMinutes!)} minutes ${event} than when you selected this trip. Review the deadline below or compare alternatives.`
              : timing.reason}
          </Alert>
        )}
        {timing.state === "live" && (
          <Box aria-live="polite">
            {timing.boardingAt && (
              <Typography sx={{ fontWeight: 650 }}>
                Bus at boarding stop: {time(timing.boardingAt)} campus time
              </Typography>
            )}
            {timing.arrivalAt && (
              <Typography sx={{ fontWeight: 650 }}>
                Estimated destination arrival: {time(timing.arrivalAt)}
              </Typography>
            )}
            <Typography variant="body2" color="text.secondary">
              {timing.reason}
              {timing.sourceTime ? ` Updated ${time(timing.sourceTime)}.` : ""}
            </Typography>
          </Box>
        )}
        {timing.assessment && (
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 650 }}>
              {assessmentLabels[timing.assessment.status]} (estimate)
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {timing.assessment.reason}
            </Typography>
          </Box>
        )}
        {timing.state === "walking" && (
          <Typography variant="body2" color="text.secondary">
            {timing.reason}
          </Typography>
        )}
        <Box component="details">
          <Box
            component="summary"
            sx={{
              cursor: "pointer",
              minHeight: 44,
              display: "list-item",
              alignContent: "center",
            }}
          >
            Journey steps
          </Box>
          <Box component="ol" sx={{ pl: 3, mb: 0 }}>
            {steps.map((step, index) => (
              <Typography
                component="li"
                key={step}
                variant="body2"
                aria-current={index === stage ? "step" : undefined}
                sx={{
                  py: 0.75,
                  fontWeight: index === stage ? 700 : 400,
                  color: index < stage ? "text.secondary" : "text.primary",
                }}
              >
                {index < stage ? "Completed: " : ""}
                {step}
              </Typography>
            ))}
          </Box>
        </Box>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          useFlexGap
          sx={{
            flexWrap: "wrap",
            "& > .MuiButton-root": { width: { xs: "100%", sm: "auto" } },
          }}
        >
          <Button
            variant="contained"
            disabled={personal.busy || timing.state === "expired"}
            onClick={() => {
              if (stage >= steps.length - 2) void finish(true);
              else
                void (async () => {
                  if (
                    (await personal.setActive({ ...trip, step: stage + 1 })) &&
                    stage >= 1
                  )
                    clearWatches();
                })();
            }}
          >
            {actions[stage] ?? "Finish trip"}
          </Button>
          {stage > 0 && (
            <Button
              disabled={personal.busy || timing.state === "expired"}
              onClick={() =>
                void personal.setActive({ ...trip, step: stage - 1 })
              }
            >
              Previous step
            </Button>
          )}
          {bus && stage <= 1 && (
            <Button disabled={personal.busy} onClick={() => onRecovery(true)}>
              I missed the bus
            </Button>
          )}
          <Button disabled={personal.busy} onClick={() => onRecovery(false)}>
            Compare alternatives
          </Button>
          {busActive && timing.state !== "live" && (
            <Button
              onClick={() => {
                setRevision((n) => n + 1);
                onRefresh();
              }}
            >
              Refresh timing
            </Button>
          )}
          <Button
            color="inherit"
            disabled={personal.busy}
            onClick={() => void finish(false)}
          >
            End trip
          </Button>
        </Stack>
        {alerts
          .filter(
            (alert) => !dismissed.includes(`alert:${identity}:${alert.id}`),
          )
          .map((alert) => (
            <AgencyAlert
              key={alert.id}
              alert={alert}
              now={now}
              onClose={() =>
                setDismissed((items) => [
                  ...items,
                  `alert:${identity}:${alert.id}`,
                ])
              }
            />
          ))}
        <ManualNotices
          scoped
          routeIds={timing.routeId ? [timing.routeId] : []}
          stopIds={stops.map((stop) => stop.id)}
        />
      </Stack>
    </Paper>
  );
}
