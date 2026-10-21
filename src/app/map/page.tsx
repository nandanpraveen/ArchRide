"use client";

import { Suspense, useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Alert, Box, Button, CircularProgress, List, ListItem, ListItemButton, ListItemText, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { activeTransitAlerts, feedFreshness, freshness, vehicleFreshness } from "@/lib/transit/contracts";
import { mapCoordinates, routeColor, transitTime } from "@/lib/transit/map-data";
import { usePublicTransit } from "@/lib/transit/public-data";
import { MapPlaceDetails, MapRouteDetails, MapStopDetails, type MapPlace, type RouteGeometry } from "@/components/map-details";

const EMPTY_PATH: [number, number][] = [];
const TransitMap = dynamic(() => import("@/components/transit-map"), {
  ssr: false,
  loading: () => <CircularProgress aria-label="Loading map" />,
});

function MapContent() {
  const { data, status, reason, retry } = usePublicTransit();
  const search = useSearchParams();
  const router = useRouter();
  const routeId = search.get("route");
  const stopId = search.get("stop");
  const vehicleId = search.get("vehicle");
  const placeId = search.get("place");
  const tripId = search.get("trip");
  const [query, setQuery] = useState("");
  const [tilesFailed, setTilesFailed] = useState(false);
  const [mapKey, setMapKey] = useState(0);
  const [geometry, setGeometry] = useState<RouteGeometry | null>(null);
  const [place, setPlace] = useState<MapPlace | null>(null);
  const handleTilesFailed = useCallback(() => setTilesFailed(true), []);
  const handleGeometry = useCallback((next: RouteGeometry) => setGeometry(next), []);
  const handlePlace = useCallback((next: MapPlace) => setPlace(next), []);
  const select = useCallback((kind: "stop" | "vehicle", id: string) => {
    const params = new URLSearchParams(search.toString());
    params.delete("stop"); params.delete("vehicle"); params.delete("place"); params.delete("type");
    params.set(kind, id);
    router.push(`/map?${params}`, { scroll: false });
  }, [search, router]);
  const selectStop = useCallback((id: string) => select("stop", id), [select]);
  const selectTrip = (id: string) => {
    const params = new URLSearchParams(search.toString()); params.set("trip", id);
    router.push(`/map?${params}`, { scroll: false });
  };
  const route = data?.routes.find((r) => r.id === routeId);
  const stop = data?.stops.find((s) => s.id === stopId);
  const vehicle = data?.vehicles.find((v) => v.id === vehicleId);
  const routeGeometry = routeId && geometry?.routeId === routeId && (!tripId || geometry.tripId === tripId) ? geometry : null;
  const routeStops = data?.stops.filter((s) => !route || routeGeometry?.stopIds.includes(s.id) || s.id === stopId) || [];
  const vehicles = data?.vehicles.filter((v) => (!route || v.route_id === route.id) && mapCoordinates(v.longitude, v.latitude)) || [];
  const queryWords = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches = (name: string) => queryWords.every((word) => name.toLocaleLowerCase().includes(word));
  const staticHealth = data?.health.find((h) => h.id.endsWith(":static"));
  const realtimeHealth = data?.health.filter((h) => h.id.startsWith("uga-passio:") && !h.id.endsWith(":static"));
  const revision = data?.health.map((h) => `${h.id}:${h.updated_at}`).join("|") || "";
  const shownPlace = placeId && place?.id === placeId ? place : undefined;
  return <Stack spacing={3}>
    <Typography component="h1" variant="h1">Campus map</Typography>
    <Typography color="text.secondary">Explore verified UGA routes and boarding stops. The directory and stop details work even when the map cannot load.</Typography>
    {status === "loading" && <Typography role="status">Loading transit data…</Typography>}
    {status === "unavailable" && <Alert severity="warning" action={<Button onClick={retry} color="inherit">Retry data</Button>}>{reason}{data && " Showing the last loaded snapshot; it may be stale."}</Alert>}
    {data && <>
      {data.errors && Object.entries(data.errors).filter(([part]) => part !== "routes" && part !== "stops").map(([part]) => <Alert key={part} severity="warning">{part === "health" ? "Source status" : part[0].toUpperCase() + part.slice(1)} could not refresh. Other loaded campus information is still available; retained information may be stale.</Alert>)}
      <Typography variant="body2">UGA / Passio · {staticHealth?.last_success_at ? `Campus catalog ${feedFreshness(staticHealth)} · updated ${transitTime(staticHealth.last_success_at)}` : "Campus catalog update time unavailable"}</Typography>
      {(!realtimeHealth?.length || realtimeHealth.some((h) => feedFreshness(h) !== "current")) && <Alert severity="info">Live transit information is stale or unavailable. Old bus positions are labeled stale; missing buses do not mean a route is cancelled.</Alert>}
      {activeTransitAlerts(data.alerts).filter((alert) => {
        if (!route && !stop) return true;
        const selectors = alert.informed_entities;
        if (!Array.isArray(selectors) || !selectors.length) return true;
        return selectors.some((s) => s && typeof s === "object" && !Array.isArray(s) && ((!s.routeId && !s.stopId && !s.trip) || (route && s.routeId === route.source_id_raw) || (stop && s.stopId === stop.source_id_raw)));
      }).map((alert) => <Alert key={alert.id} severity="warning"><strong>{alert.header || "Transit alert"}</strong> {alert.description} · {freshness(alert.source_timestamp)} source alert · updated {transitTime(alert.source_timestamp)}</Alert>)}
    </>}
    {tilesFailed && <Alert severity="warning" action={<Button color="inherit" onClick={() => { setTilesFailed(false); setMapKey((key) => key + 1); }}>Retry map</Button>}>The map could not load. Use the route and stop lists below, or try again.</Alert>}
    <Box sx={{ position: "relative", height: "min(60dvh, 560px)", minHeight: 320, borderRadius: 2, overflow: "hidden", border: 1, borderColor: "divider" }}>
      <TransitMap key={mapKey} routes={data?.routes || []} stops={routeStops} vehicles={vehicles} path={routeGeometry?.path || EMPTY_PATH} route={route} selectedStop={stop} selectedVehicle={vehicle} selectedPlace={shownPlace} onSelect={select} onTilesFailed={handleTilesFailed} />
    </Box>
    <Typography variant="caption">Map © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>. Tiles are a best-effort service.</Typography>
    {data && <>
      {routeId && !route && <Alert severity="warning">This route is not available in the current catalog.</Alert>}
      {stopId && !stop && <Alert severity="warning">This stop is not available in the current catalog.</Alert>}
      {vehicleId && !vehicle && <Alert severity="warning">This bus is no longer in the current snapshot.</Alert>}
      {placeId && <MapPlaceDetails key={`${placeId}:${search.get("type")}`} id={placeId} type={search.get("type")} onPlace={handlePlace} />}
      <TextField label="Search route and stop directory" value={query} onChange={(e) => setQuery(e.target.value)} />
      <TextField select label="Route filter" value={route?.id || ""} onChange={(e) => router.push(e.target.value ? `/map?route=${encodeURIComponent(e.target.value)}` : "/map", { scroll: false })}>
        <MenuItem value="">All routes</MenuItem>
        {data.routes.map((r) => <MenuItem key={r.id} value={r.id}>{r.long_name || r.short_name}</MenuItem>)}
      </TextField>
      {route && <MapRouteDetails key={route.id} route={route} stops={data.stops} tripId={tripId} onTrip={selectTrip} onGeometry={handleGeometry} onStop={selectStop} />}
      {stop && <MapStopDetails key={stop.id} stop={stop} routes={data.routes} revision={revision} />}
      {vehicle && <Stack component="section" aria-label="Bus details" spacing={1}>
        <Typography component="h2" variant="h2">Bus {vehicle.source_id_raw}</Typography>
        <Typography>{data.routes.find((r) => r.id === vehicle.route_id)?.long_name || "Route unavailable"} · {vehicleFreshness(vehicle)} position · observed {transitTime(vehicle.position_timestamp)}</Typography>
        {vehicle.stop_id && <Button component={Link} href={`/map?stop=${encodeURIComponent(vehicle.stop_id)}`}>Open reported stop</Button>}
      </Stack>}
      <Box component="section" aria-label="Transit directory">
        <Typography component="h2" variant="h2">Route directory</Typography>
        <List aria-label="Routes" sx={{ maxHeight: 320, overflow: "auto" }}>
          {data.routes.filter((r) => matches(`${r.short_name} ${r.long_name}`)).map((r) => <ListItem key={r.id} disablePadding><ListItemButton component={Link} href={`/map?route=${encodeURIComponent(r.id)}`} selected={r.id === routeId} sx={{ minHeight: 48 }}><Box aria-hidden="true" sx={{ width: 12, height: 12, borderRadius: "50%", bgcolor: routeColor(r), mr: 2, flexShrink: 0 }} /><ListItemText primary={r.long_name || r.short_name} secondary={r.short_name} /></ListItemButton></ListItem>)}
        </List>
        {!data.routes.some((r) => matches(`${r.short_name} ${r.long_name}`)) && <Typography>No matching routes in the current catalog.</Typography>}
        <Typography component="h2" variant="h2">Boarding stops</Typography>
        {route && !routeGeometry && <Typography>Choose a route pattern to load its boarding stops.</Typography>}
        <List aria-label="Boarding stops" sx={{ maxHeight: 320, overflow: "auto" }}>
          {routeStops.filter((s) => matches(s.name)).map((s) => <ListItem key={s.id} disablePadding><ListItemButton component={Link} href={`/map?stop=${encodeURIComponent(s.id)}`} selected={s.id === stopId} sx={{ minHeight: 48 }}><ListItemText primary={s.name} secondary="Verified UGA boarding point" /></ListItemButton></ListItem>)}
        </List>
        {!routeStops.some((s) => matches(s.name)) && <Typography>No matching boarding stops are available for this selection.</Typography>}
        <Typography component="h2" variant="h2">Bus positions</Typography>
        <List aria-label="Bus positions">
          {vehicles.map((v) => <ListItem key={v.id} disablePadding><ListItemButton component={Link} href={`/map?vehicle=${encodeURIComponent(v.id)}`} sx={{ minHeight: 48 }}><ListItemText primary={`Bus ${v.source_id_raw} · ${data.routes.find((r) => r.id === v.route_id)?.long_name || "Route unavailable"}`} secondary={`${vehicleFreshness(v)} position · observed ${transitTime(v.position_timestamp)}`} /></ListItemButton></ListItem>)}
        </List>
        {!vehicles.length && <Typography>No vehicle positions are available for this selection.</Typography>}
      </Box>
    </>}
  </Stack>;
}

export default function MapPage() {
  return <Suspense fallback={<Typography role="status">Loading campus map…</Typography>}><MapContent /></Suspense>;
}
