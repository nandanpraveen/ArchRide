"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Paper,
  Skeleton,
  Stack,
  Typography,
  useMediaQuery,
} from "@mui/material";
import DirectionsWalkRounded from "@mui/icons-material/DirectionsWalkRounded";
import DirectionsBusRounded from "@mui/icons-material/DirectionsBusRounded";
import ScheduleRounded from "@mui/icons-material/ScheduleRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import BookmarkBorderRounded from "@mui/icons-material/BookmarkBorderRounded";
import { useNotificationCenter } from "@/components/notifications-provider";
import { JourneyForm } from "@/components/journey-form";
import { CampusOverview } from "@/components/campus-overview";
import { AgencyAlert } from "@/components/agency-alert";
import { ActiveJourney } from "@/components/active-journey";
import { ManualNotices } from "@/components/manual-notices";
import { recoveryOrigin, relevantTripAlerts } from "@/lib/active-trip";
import { useArrivalClock } from "@/components/arrival-status";
import { usePersonal } from "@/components/personal-provider";
import { usePublicTransit } from "@/lib/transit/public-data";
import { arrivalFeedConnected } from "@/lib/transit/contracts";
import { assessDeadline } from "@/lib/transit/deadlines";
import { currentJourney, type Journey } from "@/lib/planner/planner";
import { loadJourneys } from "@/lib/planner/load";
import { placeRef, planRefHref, type PlaceRef } from "@/lib/personal";
const time = (iso: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(Date.parse(iso));
const minutes = (seconds: number) => Math.max(0, Math.ceil(seconds / 60));
const labels = {
  on_time: "On time",
  tight: "Tight timing",
  likely_late: "Likely late",
  insufficient: "Timing unavailable",
} as const;
type Result = Awaited<ReturnType<typeof loadJourneys>>;
function ref(params: URLSearchParams, key: string): PlaceRef | null {
  const id = params.get(key),
    type = params.get(key + "Type") ?? "stop";
  return id && ["building", "entrance", "stop"].includes(type)
    ? { id, name: "Selected campus location", type: type as PlaceRef["type"] }
    : null;
}
function JourneyCard({
  journey,
  from,
  to,
  recommended,
  deadline,
  now,
  onStart,
}: {
  journey: Journey;
  from: PlaceRef;
  to: PlaceRef;
  recommended: boolean;
  deadline: string | null;
  now: number;
  onStart: (j: Journey) => void;
}) {
  const personal = usePersonal(),
    [expanded, setExpanded] = useState(recommended && journey.mode === "bus");
  const assessment = deadline
    ? assessDeadline(journey, deadline, personal.prefs.buffer * 60, now)
    : null;
  const saved = personal.items.some(
    (i) =>
      i.origin?.id === from.id &&
      i.origin?.type === from.type &&
      i.destination.id === to.id &&
      i.destination.type === to.type,
  );
  return (
    <Paper
      variant="outlined"
      component="article"
      sx={{
        p: { xs: 2, sm: 3 },
        borderColor: recommended ? "primary.main" : "divider",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <Stack spacing={2}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}
        >
          {recommended && (
            <Chip size="small" label="Best fit" color="primary" />
          )}
          {journey.support.kind === "schedule" && (
            <Chip size="small" label="Timetable estimate" variant="outlined" />
          )}
          {assessment && (
            <Chip
              size="small"
              label={labels[assessment.status]}
              color={
                assessment.status === "on_time"
                  ? "success"
                  : assessment.status === "insufficient"
                    ? "default"
                    : "warning"
              }
              variant="outlined"
            />
          )}
        </Stack>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "start",
            gap: 2,
            flexWrap: "wrap",
          }}
        >
          <Stack spacing={1} sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              {journey.mode === "walk" ? (
                <DirectionsWalkRounded color="primary" />
              ) : (
                <DirectionsBusRounded color="primary" />
              )}
              <Typography component="h2" variant="h2">
                {journey.mode === "walk"
                  ? "Walk directly"
                  : journey.route?.long_name}
              </Typography>
            </Stack>
            <Typography color="text.secondary">
              {journey.mode === "bus"
                ? `Toward ${journey.headsign}`
                : `${Math.round(journey.meters)} m on foot`}
            </Typography>
          </Stack>
          <Box sx={{ textAlign: "right", flexShrink: 0, ml: "auto" }}>
            <Typography
              className="transit-number"
              sx={{
                fontSize: { xs: "2rem", sm: "2.3rem" },
                fontWeight: 750,
                lineHeight: 1,
              }}
            >
              {minutes(journey.seconds)}
              <Box
                component="span"
                sx={{ fontSize: ".9rem", fontWeight: 500, ml: 0.7 }}
              >
                min
              </Box>
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Arrive {time(journey.destinationArrivalAt)}
            </Typography>
          </Box>
        </Box>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {Date.parse(journey.departureAt) - now > 60000
            ? `Leave at ${time(journey.departureAt)}`
            : "Leave now"}
          {journey.mode === "bus"
            ? ` · ${minutes(journey.walkingSeconds)} min walking`
            : ""}
        </Typography>
        {assessment && (
          <Typography variant="body2" color="text.secondary">
            {assessment.reason} All times are estimates.
          </Typography>
        )}
        <Button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          sx={{ alignSelf: "flex-start", px: 0 }}
        >
          {expanded ? "Hide journey steps" : "Show journey steps"}
        </Button>
        {expanded && (
          <Stack
            component="ol"
            className="journey-line"
            spacing={2.5}
            sx={{ m: 0, listStyle: "none" }}
          >
            {journey.legs.map((leg, i) => (
              <Box component="li" key={i} sx={{ position: "relative" }}>
                <Box
                  sx={{
                    position: "absolute",
                    left: -32,
                    top: 1,
                    display: "grid",
                    placeItems: "center",
                    width: 22,
                    height: 22,
                    bgcolor: "background.paper",
                    color:
                      leg.kind === "ride" ? "primary.main" : "text.secondary",
                  }}
                >
                  {leg.kind === "ride" ? (
                    <DirectionsBusRounded sx={{ fontSize: 18 }} />
                  ) : leg.kind === "wait" ? (
                    <ScheduleRounded sx={{ fontSize: 18 }} />
                  ) : (
                    <DirectionsWalkRounded sx={{ fontSize: 18 }} />
                  )}
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {leg.label}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {minutes(leg.seconds)} min
                  {leg.path ? ` · ${Math.round(leg.path.meters)} m` : ""}
                </Typography>
              </Box>
            ))}
          </Stack>
        )}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
          <Button
            variant={recommended ? "contained" : "outlined"}
            onClick={() => onStart(journey)}
            disabled={!personal.ready || personal.busy}
          >
            Start {journey.mode === "walk" ? "walking" : "trip"}
          </Button>
          {from.id !== "current-location" && (
            <Button
              startIcon={<BookmarkBorderRounded />}
              disabled={!personal.ready || personal.busy || saved}
              onClick={() => void personal.saveItem(to, from)}
            >
              {saved ? "Journey saved" : "Save journey"}
            </Button>
          )}
        </Stack>
        <Box component="details">
          <Box
            component="summary"
            sx={{
              fontSize: ".75rem",
              color: "text.secondary",
              cursor: "pointer",
              py: 1,
            }}
          >
            About this estimate
          </Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mt: 1 }}
          >
            {journey.support.kind === "live"
              ? "Official UGA / Passio predictions, checked for reachable boarding."
              : journey.support.kind === "schedule"
                ? "Published service calendar and stop timetable. Actual arrivals may differ."
                : "Pedestrian path calculated by FOSSGIS using OpenStreetMap data."}{" "}
            Walking times use your pace preference. Paths do not certify
            accessibility.{" "}
            {journey.support.kind === "live" &&
            journey.support.estimate.sourceTime
              ? `Transit updated ${time(journey.support.estimate.sourceTime)}.`
              : ""}
          </Typography>
        </Box>
      </Stack>
    </Paper>
  );
}
function PlanContent() {
  const desktop = useMediaQuery("(min-width: 900px)");
  const search = useSearchParams(),
    query = search.toString(),
    router = useRouter(),
    transit = usePublicTransit(),
    personal = usePersonal(),
    notifications = useNotificationCenter(),
    now = useArrivalClock();
  const [result, setResult] = useState<{ query: string; data: Result } | null>(
      null,
    ),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [revision, setRevision] = useState(0),
    [arrived, setArrived] = useState(false),
    [pendingTrip, setPendingTrip] = useState<Journey | null>(null);
  const selection = useMemo(() => {
    const p = new URLSearchParams(query);
    return {
      fromRef: ref(p, "from"),
      toRef: ref(p, "to"),
      gps: p.get("fromSource") === "current-location",
      deadline: p.get("deadline"),
      missed: p.get("missed"),
      recovery: p.get("recovery"),
    };
  }, [query]);
  const { fromRef, toRef, gps, deadline, missed, recovery } = selection;
  const routes = transit.data?.routes,
    stops = transit.data?.stops;
  const catalog = useMemo(
    () => (routes && stops ? { routes, stops } : null),
    [routes, stops],
  );
  const preferences = personal.prefs;
  useEffect(() => {
    if (!toRef || (!fromRef && !gps) || !catalog) return;
    const controller = new AbortController();
    let running = false;
    async function load() {
      if (running || document.hidden) return;
      running = true;
      setLoading(true);
      setError("");
      try {
        const data = await loadJourneys({
          from: fromRef,
          to: toRef!,
          gps,
          preferences,
          transit: catalog!,
          deadline,
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(45000),
          ]),
        });
        if (!controller.signal.aborted) setResult({ query, data });
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error
              ? e.message
              : "Trip options could not load. Try again.",
          );
      } finally {
        running = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    const timer = setInterval(() => void load(), 30000);
    const visible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [query, fromRef, toRef, gps, catalog, preferences, deadline, revision]);
  const data = result?.query === query ? result.data : null,
    connected = arrivalFeedConnected(
      transit.data?.health.find((h) => h.id === "uga-passio:arrivals"),
      now,
    );
  const options = (data?.journeys ?? [])
    .map((j) => currentJourney(j, now, connected))
    .filter((j): j is Journey => !!j && (j.instanceKey ?? j.id) !== missed);
  const first = options[0],
    selectedOrigin =
      data?.from ?? fromRef ?? (recovery ? null : preferences.defaultOrigin);
  const mapPath =
    first?.legs.filter((l) => l.path).flatMap((l) => l.path!.coordinates) ?? [];
  const relevant = relevantTripAlerts(
    transit.data?.alerts ?? [],
    first?.route,
    first
      ? [first.board, first.alight].filter(
          (stop): stop is NonNullable<typeof stop> => !!stop,
        )
      : [],
    first?.tripId,
    now,
  );
  async function start(j: Journey) {
    if (!data) return;
    const current = currentJourney(j, now, connected);
    if (!current) {
      setError(
        "This option is no longer current. Refresh and choose a reachable journey.",
      );
      setRevision((n) => n + 1);
      return;
    }
    j = current;
    const okay = await personal.setActive({
      origin: data.from.id === "current-location" ? null : placeRef(data.from),
      destination: placeRef(data.to),
      mode: j.mode,
      step: 0,
      instanceKey: j.instanceKey ?? (j.mode === "bus" ? j.id : null),
      boardingSequence: j.boardingSequence ?? null,
      boarding: j.board ? placeRef({ ...j.board, type: "stop" }) : null,
      alighting: j.alight ? placeRef({ ...j.alight, type: "stop" }) : null,
      routeName: j.route?.long_name ?? "",
      headsign: j.headsign ?? "",
      deadline,
      tripId: j.tripId ?? null,
      alightingSequence: j.alightingSequence ?? null,
      selectedBoardingAt:
        j.mode === "bus"
          ? new Date(
              Date.parse(j.departureAt) +
                (j.legs[0].seconds + j.legs[1].seconds) * 1000,
            ).toISOString()
          : null,
      selectedDestinationArrivalAt: j.destinationArrivalAt,
      walkToSeconds: j.mode === "bus" ? Math.ceil(j.legs[0].seconds) : null,
      walkFromSeconds:
        j.mode === "bus" ? Math.ceil(j.legs.at(-1)!.seconds) : null,
      expiresAt: new Date(now + 3 * 3600000).toISOString(),
    });
    if (okay) {
      for (const bus of notifications.watched)
        if (bus.activeTrip) notifications.unwatchBus(bus);
      setArrived(false);
      if (j.mode === "bus" && j.board && j.arrivalIds && j.tripId)
        notifications.watchBus({
          activeTrip: true,
          instanceKey: j.instanceKey,
          arrivalId: j.arrivalIds[0],
          tripId: j.tripId,
          stopId: j.board.id,
          routeName: j.route?.long_name ?? "Your bus",
          stopName: j.board.name,
          walkSeconds: j.legs[0].seconds,
          safetySeconds: j.boardingBufferSeconds,
          planLink:
            planRefHref(
              data.from.id === "current-location" ? null : placeRef(data.from),
              placeRef(data.to),
            ) + (deadline ? `&deadline=${encodeURIComponent(deadline)}` : ""),
        });
      window.scrollTo({
        top: 0,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    }
  }
  async function recover(missedBus: boolean) {
    const trip = personal.active;
    if (!trip || !(await personal.setActive(null))) return;
    for (const bus of notifications.watched)
      if (bus.activeTrip && bus.instanceKey === trip.instanceKey)
        notifications.unwatchBus(bus);
    const href = planRefHref(recoveryOrigin(trip), trip.destination);
    router.push(
      href +
        (trip.deadline
          ? `&deadline=${encodeURIComponent(trip.deadline)}`
          : "") +
        (missedBus && trip.instanceKey
          ? `&missed=${encodeURIComponent(trip.instanceKey)}`
          : "") +
        `&recovery=${missedBus ? "missed" : "changed"}`,
    );
    setRevision((n) => n + 1);
  }
  const directions = data
    ? `https://www.google.com/maps/dir/?api=1&origin=${data.from.latitude},${data.from.longitude}&destination=${data.to.latitude},${data.to.longitude}&travelmode=walking`
    : null;
  const formPanel = (
    <Box
      id="journey-form"
      component="section"
      aria-label="Edit your journey"
      sx={{
        minWidth: 0,
        gridArea: "form",
        scrollMarginTop: 24,
      }}
    >
      <JourneyForm
        key={query}
        initialFrom={selectedOrigin}
        initialTo={data?.to ?? toRef}
        initialDeadline={deadline}
        initialGps={gps}
      />
    </Box>
  );
  const optionsPanel = (
    <Stack
      spacing={2.5}
      component="section"
      aria-label="Journey options"
      aria-busy={loading}
      sx={{ minWidth: 0, gridArea: "options" }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          flexWrap: "wrap",
        }}
      >
        <Typography component="h2" variant="h2">
          {data ? `${data.from.name} to ${data.to.name}` : "Your trip options"}
        </Typography>
        <Button component="a" href="#journey-form">
          Edit trip
        </Button>
        {data && (
          <Button
            startIcon={<RefreshRounded />}
            disabled={loading}
            onClick={() => setRevision((n) => n + 1)}
            sx={{ flexShrink: 0 }}
          >
            Refresh
          </Button>
        )}
      </Box>
      {loading && !data && (
        <>
          <Typography role="status" color="text.secondary">
            Checking pedestrian paths and current arrivals…
          </Typography>
          <Skeleton variant="rounded" height={340} />
        </>
      )}
      {loading && data && (
        <Typography role="status" variant="body2" color="text.secondary">
          Refreshing your options…
        </Typography>
      )}
      {error && (
        <Alert
          severity="warning"
          action={
            <Button onClick={() => setRevision((n) => n + 1)} color="inherit">
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}
      {personal.error && <Alert severity="error">{personal.error}</Alert>}
      {transit.status === "unavailable" && (
        <Alert
          severity="warning"
          action={
            <Button onClick={transit.retry} color="inherit">
              Retry
            </Button>
          }
        >
          Campus transit data could not refresh. Current bus recommendations may
          be unavailable.
        </Alert>
      )}
      {toRef && !fromRef && !gps && (
        <Alert severity="info">
          Choose a starting point to compare your trip options.
        </Alert>
      )}
      <ManualNotices
        routeIds={first?.route ? [first.route.id] : []}
        stopIds={[first?.board?.id, first?.alight?.id].filter(
          (id): id is string => !!id,
        )}
      />
      {relevant.slice(0, 3).map((alert) => (
        <AgencyAlert key={alert.id} alert={alert} now={now} />
      ))}
      {options.slice(0, 4).map((j, i) => (
        <JourneyCard
          key={j.id}
          journey={j}
          from={data!.from}
          to={data!.to}
          recommended={i === 0}
          deadline={deadline}
          now={now}
          onStart={(j) => (personal.active ? setPendingTrip(j) : void start(j))}
        />
      ))}
      {data && !loading && !options.length && (
        <Alert severity="info">
          No complete, verified journey is available right now. Try refreshing,
          choose another starting point, or open walking directions.
        </Alert>
      )}
      {data && !options.some((j) => j.mode === "bus") && options.length > 0 && (
        <Typography variant="body2" color="text.secondary">
          No reachable direct bus trip could be verified from nearby stops.
          Walking remains available.
        </Typography>
      )}
      {data?.warnings.length ? (
        <Box component="details">
          <Box
            component="summary"
            sx={{
              cursor: "pointer",
              fontSize: ".875rem",
              color: "text.secondary",
              py: 1,
            }}
          >
            Some trip information is unavailable
          </Box>
          {data.warnings.map((w) => (
            <Typography
              key={w}
              variant="body2"
              color="text.secondary"
              sx={{ mt: 1 }}
            >
              {w}
            </Typography>
          ))}
        </Box>
      ) : null}
      {directions && (
        <Button
          component="a"
          href={directions}
          target="_blank"
          rel="noopener noreferrer"
          variant="outlined"
        >
          Open walking directions ↗
        </Button>
      )}
      <Typography variant="caption" color="text.secondary">
        Pedestrian routing: FOSSGIS / © OpenStreetMap contributors.{" "}
        <a
          href="https://www.openstreetmap.org/fixthemap"
          target="_blank"
          rel="noopener noreferrer"
        >
          Fix the map
        </a>
        .
      </Typography>
    </Stack>
  );
  return (
    <Stack spacing={3.5}>
      <Dialog
        open={!!pendingTrip}
        onClose={() => setPendingTrip(null)}
        aria-labelledby="replace-trip-title"
      >
        <DialogTitle id="replace-trip-title">
          Replace your current trip?
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Your trip to {personal.active?.destination.name} will end when the
            new trip starts. Your saved journeys are kept.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingTrip(null)}>
            Keep current trip
          </Button>
          <Button
            variant="contained"
            disabled={personal.busy}
            onClick={() => {
              if (pendingTrip) void start(pendingTrip);
              setPendingTrip(null);
            }}
          >
            Start new trip
          </Button>
        </DialogActions>
      </Dialog>
      <Box>
        <Typography component="h1" variant="h1">
          Plan your trip
        </Typography>
      </Box>
      <ActiveJourney
        transit={transit.data}
        onRefresh={transit.retry}
        onRecovery={(missedBus) => void recover(missedBus)}
        onFinish={() => setArrived(true)}
      />
      {arrived && (
        <Alert severity="success" onClose={() => setArrived(false)}>
          You’ve arrived. Your trip is complete.
        </Alert>
      )}
      {!!recovery && (
        <Alert severity="info">
          {missed
            ? "The missed bus is excluded. "
            : "Let’s compare current options. "}
          Your destination, deadline, and preferences are kept.{" "}
          {fromRef
            ? "Your confirmed stop is the starting point."
            : "Choose your current starting point before continuing."}
        </Alert>
      )}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "minmax(0,1fr)",
            md: toRef ? "minmax(280px,340px) minmax(0,1fr)" : "minmax(300px,360px) minmax(0,1fr)",
            lg: toRef ? "minmax(280px,320px) minmax(0,1fr) minmax(360px,420px)" : "minmax(300px,360px) minmax(0,1fr)",
          },
          gridTemplateAreas: {
            xs: toRef && (fromRef || gps) ? '"options" "form"' : toRef ? '"form" "options"' : '"form"',
            md: toRef ? '"form options" "map options"' : '"form map"',
            lg: toRef ? '"form map options"' : '"form map"',
          },
          gap: 3,
          alignItems: "start",
        }}
      >
        {toRef && (fromRef || gps) ? (
          <>
            {optionsPanel}
            {formPanel}
          </>
        ) : (
          <>
            {formPanel}
            {toRef && optionsPanel}
          </>
        )}
        {desktop && (
          <Box
            component="section"
            aria-label="Journey map"
            sx={{
              gridArea: "map",
              minWidth: 0,
              height: { md: "max(340px, 45dvh)", lg: "max(520px, calc(100dvh - 220px))" },
              position: { lg: "sticky" },
              top: 24,
            }}
          >
            <CampusOverview data={transit.data} path={first?.mode === "walk" ? mapPath : undefined} unavailable={transit.status === "unavailable"} />
          </Box>
        )}
      </Box>
    </Stack>
  );
}
export default function PlanPage() {
  return (
    <Suspense fallback={<Skeleton variant="rounded" height={400} />}>
      <PlanContent />
    </Suspense>
  );
}
