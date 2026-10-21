"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Button, List, ListItem, ListItemButton, ListItemText, MenuItem, Stack, TextField, Typography } from "@mui/material";
import type { Arrival, Route, Stop } from "@/lib/transit/contracts";
import { usableArrival } from "@/lib/transit/contracts";
import { mapCoordinates, mapPath, transitTime } from "@/lib/transit/map-data";
import { publicTransitClient } from "@/lib/transit/public-data";
import type { Tables } from "@/lib/supabase/database.types";

export type RouteGeometry = { routeId: string; tripId: string; path: [number, number][]; stopIds: string[] };
export type MapPlace = { type?: "building" | "entrance"; id: string; name: string; latitude: number; longitude: number };

export function MapRouteDetails({ route, stops, tripId, onTrip, onGeometry, onStop }: {
  route: Route; stops: Stop[]; tripId: string | null;
  onTrip: (id: string) => void; onGeometry: (data: RouteGeometry) => void; onStop: (id: string) => void;
}) {
  const [trips, setTrips] = useState<Tables<"transit_trips">[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]);
    const db = publicTransitClient();
    if (db) void Promise.resolve(db.from("transit_trips").select("*").eq("route_id", route.id).eq("active", true).order("id").limit(1000).abortSignal(signal)).then((result) => {
      if (controller.signal.aborted) return;
      if (result.error || result.data?.length === 1000) setError(true);
      else { setError(false); setTrips(result.data || []); }
    });
    return () => controller.abort();
  }, [route.id]);
  const trip = trips?.find((t) => t.id === tripId) || (!tripId ? trips?.[0] : undefined);
  return <Stack component="section" spacing={2} aria-label="Route details">
    <Typography variant="h2" component="h2">{route.long_name || route.short_name}</Typography>
    {error ? <Alert severity="warning">Route details are unavailable. Choose the route again to retry.</Alert> : trips === null ? <Typography role="status">Loading route details…</Typography> : !trips.length ? <Typography>No route patterns are available.</Typography> : <>
      <TextField select label="Direction and trip pattern" value={trip?.id || ""} onChange={(e) => onTrip(e.target.value)}>
        {trips.map((t) => <MenuItem key={t.id} value={t.id}>{t.headsign || "Direction unavailable"} · {t.direction_id === null ? "variant" : `direction ${t.direction_id}`} · {t.source_id_raw}</MenuItem>)}
      </TextField>
      {trip ? <MapTripDetails key={trip.id} trip={trip} stops={stops} onGeometry={onGeometry} onStop={onStop} /> : <Alert severity="warning">This route pattern is not available.</Alert>}
    </>}
  </Stack>;
}

function MapTripDetails({ trip, stops, onGeometry, onStop }: {
  trip: Tables<"transit_trips">; stops: Stop[];
  onGeometry: (data: RouteGeometry) => void; onStop: (id: string) => void;
}) {
  const [details, setDetails] = useState<{ times: Tables<"transit_stop_times">[]; hasPath: boolean; calendar: string } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]);
    const db = publicTransitClient();
    if (db) void (async () => {
      try {
        const [times, shape, service] = await Promise.all([
          db.from("transit_stop_times").select("*").eq("trip_id", trip.id).order("stop_sequence").limit(1000).abortSignal(signal),
          trip.shape_id ? db.from("transit_shapes").select("points").eq("id", trip.shape_id).abortSignal(signal).maybeSingle() : Promise.resolve({ data: null, error: null }),
          db.from("transit_services").select("calendar").eq("id", trip.service_id).abortSignal(signal).maybeSingle(),
        ]);
        if (controller.signal.aborted) return;
        if (times.error || shape.error || service.error || times.data?.length === 1000) throw new Error();
        const path = mapPath(shape.data?.points);
        const calendar = service.data?.calendar;
        const days = calendar && typeof calendar === "object" && !Array.isArray(calendar)
          ? ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].filter((day) => String(calendar[day]) === "1").map((day) => day.slice(0, 3)).join(", ") : "";
        setError(false);
        setDetails({ times: times.data || [], hasPath: path.length > 1, calendar: days });
        onGeometry({ routeId: trip.route_id, tripId: trip.id, path, stopIds: (times.data || []).map((t) => t.stop_id) });
      } catch { if (!controller.signal.aborted) setError(true); }
    })();
    return () => controller.abort();
  }, [trip, onGeometry]);
  if (error) return <Alert severity="warning">The boarding order and path could not load. Choose another pattern or retry this route.</Alert>;
  if (!details) return <Typography role="status">Loading boarding order…</Typography>;
  return <Stack spacing={1}>
    <Typography variant="body2">{details.calendar ? `Published regular service: ${details.calendar}. Holiday exceptions may apply.` : "Operating days are not supplied for this pattern."} Agency timezone: America/New_York.</Typography>
    {!details.hasPath && <Typography variant="body2">No verified route line is supplied for this pattern.</Typography>}
    <Typography component="h3" variant="h3">Boarding order</Typography>
    <List aria-label="Ordered stop occurrences" sx={{ maxHeight: 320, overflow: "auto" }}>
      {details.times.map((time) => {
        const stop = stops.find((s) => s.id === time.stop_id);
        return <ListItem key={time.id} disablePadding><ListItemButton disabled={!stop} onClick={() => onStop(time.stop_id)} sx={{ minHeight: 48 }}>
          <ListItemText primary={`${time.stop_sequence}. ${stop?.name || "Stop unavailable"}`} secondary={time.pickup_type === 1 ? "No boarding at this occurrence" : `Stop occurrence ${time.stop_sequence}`} />
        </ListItemButton></ListItem>;
      })}
    </List>
    {!details.times.length && <Typography>No boarding order was supplied.</Typography>}
  </Stack>;
}

export function MapStopDetails({ stop, routes, revision }: { stop: Stop; routes: Route[]; revision: string }) {
  const [details, setDetails] = useState<{ arrivals: Arrival[]; trips: Tables<"transit_trips">[] } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]);
    const db = publicTransitClient();
    if (db) void (async () => {
      try {
        const now = Date.now();
        const [arrivals, occurrences] = await Promise.all([
          db.from("transit_arrivals").select("*").eq("stop_id", stop.id).eq("relationship", "SCHEDULED").gte("arrival_at", new Date(now).toISOString()).gt("valid_until", new Date(now).toISOString()).order("arrival_at").limit(1000).abortSignal(signal),
          db.from("transit_stop_times").select("trip_id").eq("stop_id", stop.id).limit(1000).abortSignal(signal),
        ]);
        if (controller.signal.aborted) return;
        if (arrivals.error || occurrences.error || arrivals.data?.length === 1000 || occurrences.data?.length === 1000) throw new Error();
        const ids = [...new Set((occurrences.data || []).map((t) => t.trip_id))];
        const trips = ids.length ? await db.from("transit_trips").select("*").in("id", ids).eq("active", true).limit(1000).abortSignal(signal) : { data: [], error: null };
        if (controller.signal.aborted) return;
        if (trips.error || trips.data?.length === 1000) throw new Error();
        setError(false);
        setDetails({ arrivals: (arrivals.data || []).filter((a) => usableArrival(a, now)).slice(0, 3), trips: trips.data || [] });
      } catch { if (!controller.signal.aborted) setError(true); }
    })();
    return () => controller.abort();
  }, [stop.id, revision]);
  const serving = [...new Map((details?.trips || []).map((t) => [`${t.route_id}:${t.direction_id}:${t.headsign}`, t])).values()];
  return <Stack component="section" aria-label="Stop details" spacing={2}>
    <Typography component="h2" variant="h2">{stop.name}</Typography>
    <Typography variant="body2">Verified boarding point · {stop.latitude.toFixed(5)}, {stop.longitude.toFixed(5)}</Typography>
    {error ? <Alert severity="warning">Stop service and arrivals are unavailable. Refresh transit data to retry.</Alert> : !details ? <Typography role="status">Loading stop service…</Typography> : <>
      <Typography component="h3" variant="h3">Serving routes and directions</Typography>
      {serving.length ? <List>{serving.map((trip) => <ListItem key={`${trip.route_id}:${trip.direction_id}:${trip.headsign}`} disablePadding><ListItemButton component={Link} href={`/map?route=${encodeURIComponent(trip.route_id)}&trip=${encodeURIComponent(trip.id)}&stop=${encodeURIComponent(stop.id)}`} sx={{ minHeight: 48 }}><ListItemText primary={routes.find((r) => r.id === trip.route_id)?.long_name || "Route unavailable"} secondary={trip.headsign || "Direction not supplied"} /></ListItemButton></ListItem>)}</List> : <Typography>No current serving route information is available.</Typography>}
      <Typography component="h3" variant="h3">Next source arrivals</Typography>
      {details.arrivals.filter((a) => usableArrival(a)).length ? <List>{details.arrivals.filter((a) => usableArrival(a)).map((arrival) => <ListItem key={arrival.id}><ListItemText primary={`${routes.find((r) => r.id === arrival.route_id)?.long_name || "Route unavailable"} · ${transitTime(arrival.arrival_at!)}`} secondary={`Source prediction · stop occurrence ${arrival.stop_sequence} · updated ${transitTime(arrival.update_timestamp)}`} /></ListItem>)}</List> : <Typography>No current source arrivals are available. Missing predictions do not mean this stop or route is cancelled.</Typography>}
    </>}
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
      <Button component={Link} href={`/plan?to=${encodeURIComponent(stop.id)}`} variant="contained">Plan to this stop</Button>
      {mapCoordinates(stop.longitude, stop.latitude) && <Button component="a" href={`https://www.google.com/maps/dir/?api=1&destination=${stop.latitude},${stop.longitude}&travelmode=walking`} target="_blank" rel="noopener noreferrer" variant="outlined">Walking directions ↗</Button>}
    </Stack>
    <Typography variant="body2" color="text.secondary">Saving stops becomes available when the Saved feature is connected. External walking directions use Google Maps; no continuous location history is stored by ArchRide.</Typography>
  </Stack>;
}

export function MapPlaceDetails({ id, type, onPlace }: { id: string; type: string | null; onPlace: (place: MapPlace) => void }) {
  const [place, setPlace] = useState<MapPlace | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]);
    const db = publicTransitClient();
    if (db) void (async () => {
      const [building, entrance] = await Promise.all([
        type !== "entrance" ? db.from("transit_buildings").select("id,name,latitude,longitude").eq("id", id).abortSignal(signal).maybeSingle() : Promise.resolve({ data: null, error: null }),
        type !== "building" ? db.from("transit_entrances").select("id,name,latitude,longitude").eq("id", id).abortSignal(signal).maybeSingle() : Promise.resolve({ data: null, error: null }),
      ]);
      if (controller.signal.aborted) return;
      const rows = [building.data, entrance.data].filter((p): p is MapPlace => p !== null);
      if (!building.error && !entrance.error && rows.length === 1 && mapCoordinates(rows[0].longitude, rows[0].latitude)) {
        const found = { ...rows[0], type: building.data ? "building" as const : "entrance" as const };
        setPlace(found); onPlace(found);
      }
      setDone(true);
    })();
    return () => controller.abort();
  }, [id, type, onPlace]);
  if (type && !["building", "entrance"].includes(type)) return <Alert severity="warning">This campus location type is invalid. Choose a verified place.</Alert>;
  if (!done) return <Typography role="status">Loading campus location…</Typography>;
  if (!place) return <Alert severity="warning">This campus location is unavailable or ambiguous. Choose another verified place.</Alert>;
  return <Stack spacing={1}>
    <Typography component="h2" variant="h2">{place.name}</Typography>
    <Typography>{place.type === "entrance" ? "Mapped entrance point. Current accessibility has not been verified." : "Published campus building reference location."}</Typography>
    {place.id.startsWith("uga-oua:") && <Typography variant="body2">Campus location data: <a href="https://www.architects.uga.edu/maps" target="_blank" rel="noopener noreferrer">UGA Office of University Architects</a>.</Typography>}
    <Button component={Link} href={`/plan?to=${encodeURIComponent(place.id)}&toType=${place.type === "entrance" ? "entrance" : "building"}`} variant="outlined">Plan to this place</Button>
  </Stack>;
}
