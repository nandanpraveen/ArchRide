"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { AgencyAlert } from "@/components/agency-alert";
import { ManualNotices } from "@/components/manual-notices";
import { ParkingDirectory } from "@/components/parking-directory";
import {
  MapPlaceDetails,
  MapRouteDetails,
  MapStopDetails,
  type MapPlace,
  type RouteGeometry,
} from "@/components/map-details";
import { PARKING_LOTS } from "@/lib/parking";
import {
  activeTransitAlerts,
  arrivalFeedConnected,
  feedFreshness,
  vehicleFreshness,
} from "@/lib/transit/contracts";
import {
  mapCoordinates,
  routeColor,
  transitTime,
} from "@/lib/transit/map-data";
import { usePublicTransit } from "@/lib/transit/public-data";

const EMPTY_PATH: [number, number][] = [];
const TransitMap = dynamic(() => import("@/components/transit-map"), {
  ssr: false,
  loading: () => (
    <Skeleton variant="rectangular" height="100%" aria-label="Loading map" />
  ),
});

function MapContent() {
  const { data, status, reason, retry } = usePublicTransit();
  const search = useSearchParams(),
    router = useRouter();
  const parkingId = search.get("parking"),
    routeId = search.get("route"),
    stopId = search.get("stop"),
    vehicleId = search.get("vehicle"),
    placeId = search.get("place"),
    tripId = search.get("trip");
  const [directoryMode, setDirectoryMode] = useState("transit"),
    [showParking, setShowParking] = useState(false),
    [query, setQuery] = useState("");
  const [ready, setReady] = useState(false),
    [tilesFailed, setTilesFailed] = useState(false),
    [mapKey, setMapKey] = useState(0);
  const [geometry, setGeometry] = useState<RouteGeometry | null>(null),
    [place, setPlace] = useState<MapPlace | null>(null);
  useEffect(() => {
    queueMicrotask(() => setReady(true));
  }, []);
  const mode = parkingId ? "parking" : directoryMode;
  const parking = PARKING_LOTS.find((p) => p.id === parkingId),
    route = data?.routes.find((r) => r.id === routeId),
    stop = data?.stops.find((s) => s.id === stopId),
    vehicle = data?.vehicles.find((v) => v.id === vehicleId);
  const handleTilesFailed = useCallback(() => setTilesFailed(true), []);
  const handleGeometry = useCallback(
    (next: RouteGeometry) => setGeometry(next),
    [],
  );
  const handlePlace = useCallback((next: MapPlace) => setPlace(next), []);
  const select = useCallback(
    (kind: "stop" | "vehicle", id: string) => {
      const params = new URLSearchParams(search.toString());
      ["parking", "stop", "vehicle", "place", "type"].forEach((key) =>
        params.delete(key),
      );
      params.set(kind, id);
      setDirectoryMode("transit");
      router.push(`/map?${params}`, { scroll: false });
    },
    [search, router],
  );
  const selectParking = useCallback(
    (id: string) => {
      const params = new URLSearchParams(search.toString());
      ["stop", "vehicle", "place", "type"].forEach((key) => params.delete(key));
      params.set("parking", id);
      router.push(`/map?${params}`, { scroll: false });
    },
    [search, router],
  );
  const selectStop = useCallback((id: string) => select("stop", id), [select]);
  const selectTrip = (id: string) => {
    const params = new URLSearchParams(search.toString());
    params.set("trip", id);
    router.push(`/map?${params}`, { scroll: false });
  };
  const routeGeometry =
    routeId &&
    geometry?.routeId === routeId &&
    (!tripId || geometry.tripId === tripId)
      ? geometry
      : null;
  const routeStops =
    data?.stops.filter(
      (s) => !route || routeGeometry?.stopIds.includes(s.id) || s.id === stopId,
    ) ?? [];
  const vehicles =
    data?.vehicles.filter(
      (v) =>
        (!route || v.route_id === route.id) &&
        mapCoordinates(v.longitude, v.latitude),
    ) ?? [];
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (name: string) =>
    words.every((word) => name.toLowerCase().includes(word));
  const shownRoutes =
    data?.routes.filter((r) => matches(`${r.short_name} ${r.long_name}`)) ?? [];
  const shownStops = routeStops.filter((s) => matches(s.name));
  const staticHealth = data?.health.find((h) => h.id.endsWith(":static"));
  const realtimeHealth =
    data?.health.filter(
      (h) => h.id.startsWith("uga-passio:") && !h.id.endsWith(":static"),
    ) ?? [];
  const degraded =
    data &&
    (!realtimeHealth.length ||
      realtimeHealth.some((h) => feedFreshness(h) !== "current") ||
      !!data.errors);
  const revision =
    data?.health
      .filter((h) => h.id.endsWith(":arrivals") || h.id.endsWith(":static"))
      .map((h) => `${h.id}:${h.updated_at}`)
      .join("|") ?? "";
  const shownPlace = placeId && place?.id === placeId ? place : undefined;
  const selected = !!(routeId || stopId || vehicleId || placeId);
  const alerts = activeTransitAlerts(data?.alerts ?? []).filter((alert) => {
    if (!route && !stop) return true;
    if (
      !Array.isArray(alert.informed_entities) ||
      !alert.informed_entities.length
    )
      return true;
    return alert.informed_entities.some(
      (s) =>
        s &&
        typeof s === "object" &&
        !Array.isArray(s) &&
        ((!s.routeId && !s.stopId && !s.trip) ||
          (route && s.routeId === route.source_id_raw) ||
          (stop && s.stopId === stop.source_id_raw)),
    );
  });
  useEffect(() => {
    if (document.activeElement?.matches("input, textarea, [role=combobox]"))
      return;
    const label = parkingId
      ? "Parking details"
      : stopId
        ? "Stop details"
        : vehicleId
          ? "Bus details"
          : placeId
            ? "Place details"
            : routeId
              ? "Route details"
              : null;
    if (label)
      document
        .querySelector<HTMLElement>(`[aria-label="${label}"] h2`)
        ?.focus({ preventScroll: true });
  }, [
    parkingId,
    stopId,
    vehicleId,
    placeId,
    routeId,
    route?.id,
    stop?.id,
    vehicle?.id,
    shownPlace?.id,
  ]);
  return (
    <Stack spacing={2.5}>
      <Typography component="h1" variant="h1">
        Campus map
      </Typography>
      <Tabs
        value={mode}
        onChange={(_, value) => {
          setDirectoryMode(value);
          setQuery("");
          if (value === "transit") setShowParking(false);
          if (parkingId && value === "transit") {
            const params = new URLSearchParams(search.toString());
            params.delete("parking");
            router.push(`/map?${params}`, { scroll: false });
          }
        }}
        aria-label="Map directory"
      >
        <Tab label="Transit" value="transit" disabled={!ready} />
        <Tab label="Parking" value="parking" disabled={!ready} />
      </Tabs>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "minmax(0,1fr)",
            sm:
              mode === "transit"
                ? "minmax(0,1fr) minmax(180px,.45fr)"
                : "minmax(0,1fr)",
          },
          gap: 1.5,
        }}
      >
        <TextField
          label={
            mode === "parking"
              ? "Search parking lots and decks"
              : "Search route and stop directory"
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={!ready}
        />
        {mode === "transit" && (
          <TextField
            select
            label="Route filter"
            value={route?.id ?? ""}
            disabled={!ready || !data}
            onChange={(e) =>
              router.push(
                e.target.value
                  ? `/map?route=${encodeURIComponent(e.target.value)}`
                  : "/map",
                { scroll: false },
              )
            }
          >
            <MenuItem value="">All routes</MenuItem>
            {data?.routes.map((r) => (
              <MenuItem key={r.id} value={r.id}>
                {r.long_name || r.short_name}
              </MenuItem>
            ))}
          </TextField>
        )}
      </Box>
      {mode === "transit" && status === "unavailable" && (
        <Alert
          severity="warning"
          action={
            <Button onClick={retry} color="inherit">
              Retry data
            </Button>
          }
        >
          Transit data could not refresh. Parking information is still
          available.
        </Alert>
      )}
      {mode === "transit" && (
        <ManualNotices
          routeIds={route ? [route.id] : []}
          stopIds={stop ? [stop.id] : []}
          scoped={!!(route || stop)}
        />
      )}
      {mode === "transit" && !!alerts.length && (
        <Box component="details">
          <Box
            component="summary"
            sx={{
              minHeight: 44,
              alignContent: "center",
              cursor: "pointer",
              fontSize: ".875rem",
              fontWeight: 600,
            }}
          >
            Service updates ({alerts.length})
          </Box>
          <Stack spacing={1} sx={{ pt: 1 }}>
            {alerts.map((alert) => (
              <AgencyAlert key={alert.id} alert={alert} />
            ))}
          </Stack>
        </Box>
      )}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "minmax(0,1fr)",
            lg: "minmax(0,1.6fr) minmax(300px,1fr)",
          },
          gap: 2.5,
          alignItems: "start",
        }}
      >
        <Box sx={{ minWidth: 0, position: { lg: "sticky" }, top: 20 }}>
          <Stack
            direction="row"
            sx={{
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              mb: 1,
            }}
          >
            {mode === "transit" && (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={showParking}
                    disabled={!ready}
                    onChange={(e) => setShowParking(e.target.checked)}
                  />
                }
                label="Show parking pins"
                sx={{ m: 0 }}
              />
            )}
            <a
              href={
                mode === "parking" ? "#parking-directory" : "#transit-directory"
              }
              className="quiet-link"
            >
              Skip map
            </a>
          </Stack>
          <Box
            sx={{
              position: "relative",
              height: { xs: "min(42dvh,360px)", lg: "min(68dvh,680px)" },
              minHeight: 280,
              borderRadius: "12px",
              overflow: "hidden",
              border: 1,
              borderColor: "divider",
              bgcolor: "background.paper",
            }}
          >
            <TransitMap
              key={mapKey}
              routes={data?.routes ?? []}
              stops={mode === "parking" ? [] : routeStops}
              vehicles={mode === "parking" ? [] : vehicles}
              path={
                mode === "parking"
                  ? EMPTY_PATH
                  : (routeGeometry?.path ?? EMPTY_PATH)
              }
              route={route}
              selectedStop={mode === "parking" ? undefined : stop}
              selectedVehicle={mode === "parking" ? undefined : vehicle}
              selectedPlace={mode === "parking" ? undefined : shownPlace}
              selectedParking={parking}
              showParking={mode === "parking" || showParking}
              onParkingSelect={selectParking}
              onSelect={select}
              onTilesFailed={handleTilesFailed}
            />
          </Box>
          {tilesFailed && (
            <Alert
              severity="info"
              sx={{ mt: 1 }}
              action={
                <Button
                  color="inherit"
                  onClick={() => {
                    setTilesFailed(false);
                    setMapKey((key) => key + 1);
                  }}
                >
                  Retry map
                </Button>
              }
            >
              The map could not load. Use the directory below.
            </Alert>
          )}
        </Box>
        <Paper
          variant="outlined"
          sx={{ p: 2, minWidth: 0, borderRadius: "12px" }}
        >
          {mode === "parking" ? (
            <ParkingDirectory
              selectedId={parkingId}
              onSelect={selectParking}
              query={query}
            />
          ) : data ? (
            <Stack spacing={2.5}>
              {routeId && !route && (
                <Alert severity="warning">
                  This route is not available in the current catalog.
                </Alert>
              )}
              {stopId && !stop && (
                <Alert severity="warning">
                  This stop is not available in the current catalog.
                </Alert>
              )}
              {vehicleId && !vehicle && (
                <Alert severity="warning">
                  This bus is no longer in the current snapshot.
                </Alert>
              )}
              {placeId && (
                <MapPlaceDetails
                  key={`${placeId}:${search.get("type")}`}
                  id={placeId}
                  type={search.get("type")}
                  onPlace={handlePlace}
                />
              )}
              {route && (
                <MapRouteDetails
                  key={route.id}
                  route={route}
                  stops={data.stops}
                  tripId={tripId}
                  onTrip={selectTrip}
                  onGeometry={handleGeometry}
                  onStop={selectStop}
                />
              )}
              {stop && (
                <MapStopDetails
                  key={stop.id}
                  stop={stop}
                  routes={data.routes}
                  revision={revision}
                  connected={
                    !data.errors?.health &&
                    arrivalFeedConnected(
                      data.health.find((h) => h.id.endsWith(":arrivals")),
                    )
                  }
                />
              )}
              {vehicle && (
                <Stack component="section" aria-label="Bus details" spacing={1}>
                  <Typography component="h2" variant="h2" tabIndex={-1}>
                    Bus {vehicle.source_id_raw}
                  </Typography>
                  <Typography variant="body2">
                    {data.routes.find((r) => r.id === vehicle.route_id)
                      ?.long_name || "Route unavailable"}{" "}
                    · {vehicleFreshness(vehicle)} position ·{" "}
                    {transitTime(vehicle.position_timestamp)}
                  </Typography>
                  {vehicle.stop_id && (
                    <Button
                      component={Link}
                      href={`/map?stop=${encodeURIComponent(vehicle.stop_id)}`}
                    >
                      Open reported stop
                    </Button>
                  )}
                </Stack>
              )}
              <Box
                component="details"
                open={!selected || !!query}
                id="transit-directory"
              >
                <Box
                  component="summary"
                  sx={{
                    cursor: "pointer",
                    py: 1.5,
                    minHeight: 48,
                    fontWeight: 600,
                  }}
                >
                  Browse routes and stops
                </Box>
                <Stack
                  component="section"
                  aria-label="Transit directory"
                  spacing={1}
                >
                  <Typography component="h2" variant="h3">
                    Routes
                  </Typography>
                  <List
                    aria-label="Routes"
                    disablePadding
                    sx={{ maxHeight: 280, overflow: "auto" }}
                  >
                    {shownRoutes.map((r) => (
                      <ListItem key={r.id} disablePadding>
                        <ListItemButton
                          component={Link}
                          href={`/map?route=${encodeURIComponent(r.id)}`}
                          selected={r.id === routeId}
                          sx={{ gap: 1.5 }}
                        >
                          <Box
                            aria-hidden="true"
                            sx={{
                              width: 10,
                              height: 10,
                              borderRadius: "50%",
                              bgcolor: routeColor(r),
                              flexShrink: 0,
                            }}
                          />
                          <ListItemText primary={r.long_name || r.short_name} />
                        </ListItemButton>
                      </ListItem>
                    ))}
                  </List>
                  {!shownRoutes.length && (
                    <Typography variant="body2">No matching routes.</Typography>
                  )}
                  <Typography component="h2" variant="h3">
                    Boarding stops
                  </Typography>
                  {route && !routeGeometry && (
                    <Typography variant="body2">
                      Choose a direction to load its stops.
                    </Typography>
                  )}
                  <List
                    aria-label="Boarding stops"
                    disablePadding
                    sx={{ maxHeight: 320, overflow: "auto" }}
                  >
                    {shownStops.map((s) => (
                      <ListItem key={s.id} disablePadding>
                        <ListItemButton
                          component={Link}
                          href={`/map?stop=${encodeURIComponent(s.id)}`}
                          selected={s.id === stopId}
                        >
                          <ListItemText primary={s.name} />
                        </ListItemButton>
                      </ListItem>
                    ))}
                  </List>
                  {!shownStops.length && (
                    <Typography variant="body2">
                      No matching boarding stops.
                    </Typography>
                  )}
                  {!!vehicles.length && (
                    <Box component="details">
                      <Box
                        component="summary"
                        sx={{ minHeight: 48, py: 1.5, cursor: "pointer" }}
                      >
                        Bus positions ({vehicles.length})
                      </Box>
                      <List aria-label="Bus positions" disablePadding>
                        {vehicles.map((v) => (
                          <ListItem key={v.id} disablePadding>
                            <ListItemButton
                              component={Link}
                              href={`/map?vehicle=${encodeURIComponent(v.id)}`}
                            >
                              <ListItemText
                                primary={`Bus ${v.source_id_raw}`}
                                secondary={`${data.routes.find((r) => r.id === v.route_id)?.long_name || "Route unavailable"} · ${vehicleFreshness(v)} position`}
                              />
                            </ListItemButton>
                          </ListItem>
                        ))}
                      </List>
                    </Box>
                  )}
                </Stack>
              </Box>
            </Stack>
          ) : status === "loading" ? (
            <Skeleton variant="rounded" height={240} />
          ) : (
            <Typography color="text.secondary">
              Routes and stops could not load. Try again or browse parking.
            </Typography>
          )}
        </Paper>
      </Box>
      <Box component="details">
        <Box
          component="summary"
          sx={{
            minHeight: 48,
            py: 1.5,
            cursor: "pointer",
            color: "text.secondary",
            fontSize: ".875rem",
          }}
        >
          Map and transit sources
        </Box>
        <Stack spacing={1} sx={{ pt: 1 }}>
          <Typography variant="body2">
            UGA / Passio.{" "}
            {staticHealth?.last_success_at
              ? `Catalog ${feedFreshness(staticHealth)}; updated ${transitTime(staticHealth.last_success_at)}.`
              : "Catalog update time unavailable."}
          </Typography>
          {reason && <Typography variant="body2">{reason}</Typography>}
          {data?.errors && (
            <Typography variant="body2">
              Unavailable sections: {Object.keys(data.errors).join(", ")}.
              Retained information may be stale.
            </Typography>
          )}
          {degraded && (
            <Typography variant="body2">
              Some live updates are unavailable. Check each arrival’s status.
            </Typography>
          )}
          <Typography variant="body2">
            Missing buses do not establish a cancellation. Route colors identify
            the route; each arrival carries its own validity.
          </Typography>
          <Typography variant="body2">
            Map ©{" "}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
            >
              OpenStreetMap contributors
            </a>
            . UGA location sources and parking verification dates appear in the
            selected place’s details.
          </Typography>
        </Stack>
      </Box>
    </Stack>
  );
}
export default function MapPage() {
  return (
    <Suspense
      fallback={<Typography role="status">Loading campus map…</Typography>}
    >
      <MapContent />
    </Suspense>
  );
}
