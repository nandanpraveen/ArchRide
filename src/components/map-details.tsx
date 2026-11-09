"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { Arrival, Route, Stop } from "@/lib/transit/contracts";
import { ArrivalStatus, useArrivalClock } from "./arrival-status";
import { SaveStopButton } from "./save-stop-button";
import { RiderReport } from "./rider-report";
import { usableArrival } from "@/lib/transit/contracts";
import { mapCoordinates, mapPath, transitTime } from "@/lib/transit/map-data";
import { publicTransitClient } from "@/lib/transit/public-data";
import type { Tables } from "@/lib/supabase/database.types";

export type RouteGeometry = {
  routeId: string;
  tripId: string;
  path: [number, number][];
  stopIds: string[];
};
export type MapPlace = {
  type?: "building" | "entrance";
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};

export function MapRouteDetails({
  route,
  stops,
  tripId,
  onTrip,
  onGeometry,
  onStop,
}: {
  route: Route;
  stops: Stop[];
  tripId: string | null;
  onTrip: (id: string) => void;
  onGeometry: (data: RouteGeometry) => void;
  onStop: (id: string) => void;
}) {
  const [trips, setTrips] = useState<Tables<"transit_trips">[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(10_000),
    ]);
    const db = publicTransitClient();
    if (db)
      void Promise.resolve(
        db
          .from("transit_trips")
          .select("*")
          .eq("route_id", route.id)
          .eq("active", true)
          .order("id")
          .limit(1000)
          .abortSignal(signal),
      ).then((result) => {
        if (controller.signal.aborted) return;
        if (result.error || result.data?.length === 1000) setError(true);
        else {
          setError(false);
          setTrips(result.data || []);
        }
      });
    return () => controller.abort();
  }, [route.id]);
  const trip =
    trips?.find((t) => t.id === tripId) || (!tripId ? trips?.[0] : undefined);
  return (
    <Stack component="section" spacing={2} aria-label="Route details">
      <Typography variant="h2" component="h2" tabIndex={-1}>
        {route.long_name || route.short_name}
      </Typography>
      {error ? (
        <Alert severity="warning">
          Route details are unavailable. Choose the route again to retry.
        </Alert>
      ) : trips === null ? (
        <Typography role="status">Loading route details…</Typography>
      ) : !trips.length ? (
        <Typography>No route patterns are available.</Typography>
      ) : (
        <>
          <Autocomplete
            options={trips}
            value={trip ?? null}
            disableClearable={!!trip}
            autoHighlight
            openOnFocus
            getOptionLabel={(option) => `${option.headsign || "Direction unavailable"}${option.direction_id === null ? "" : ` · direction ${option.direction_id}`}`}
            getOptionKey={(option) => option.id}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            onChange={(_, next) => { if (next) onTrip(next.id); }}
            renderInput={(params) => <TextField {...params} label="Direction" helperText="Choose the direction before picking your stop." />}
            slotProps={{ listbox: { sx: { "& .MuiAutocomplete-option": { minHeight: 56, overflowWrap: "anywhere" } } } }}
          />
          {trip ? (
            <MapTripDetails
              key={trip.id}
              trip={trip}
              stops={stops}
              onGeometry={onGeometry}
              onStop={onStop}
            />
          ) : (
            <Alert severity="warning">
              This route pattern is not available.
            </Alert>
          )}
        </>
      )}
    </Stack>
  );
}

function MapTripDetails({
  trip,
  stops,
  onGeometry,
  onStop,
}: {
  trip: Tables<"transit_trips">;
  stops: Stop[];
  onGeometry: (data: RouteGeometry) => void;
  onStop: (id: string) => void;
}) {
  const [details, setDetails] = useState<{
    times: Tables<"transit_stop_times">[];
    hasPath: boolean;
    calendar: string;
  } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(10_000),
    ]);
    const db = publicTransitClient();
    if (db)
      void (async () => {
        try {
          const [times, shape, service] = await Promise.all([
            db
              .from("transit_stop_times")
              .select("*")
              .eq("trip_id", trip.id)
              .order("stop_sequence")
              .limit(1000)
              .abortSignal(signal),
            trip.shape_id
              ? db
                  .from("transit_shapes")
                  .select("points")
                  .eq("id", trip.shape_id)
                  .abortSignal(signal)
                  .maybeSingle()
              : Promise.resolve({ data: null, error: null }),
            db
              .from("transit_services")
              .select("calendar")
              .eq("id", trip.service_id)
              .abortSignal(signal)
              .maybeSingle(),
          ]);
          if (controller.signal.aborted) return;
          if (
            times.error ||
            shape.error ||
            service.error ||
            times.data?.length === 1000
          )
            throw new Error();
          const path = mapPath(shape.data?.points);
          const calendar = service.data?.calendar;
          const days =
            calendar && typeof calendar === "object" && !Array.isArray(calendar)
              ? [
                  "monday",
                  "tuesday",
                  "wednesday",
                  "thursday",
                  "friday",
                  "saturday",
                  "sunday",
                ]
                  .filter((day) => String(calendar[day]) === "1")
                  .map((day) => day.slice(0, 3))
                  .join(", ")
              : "";
          setError(false);
          setDetails({
            times: times.data || [],
            hasPath: path.length > 1,
            calendar: days,
          });
          onGeometry({
            routeId: trip.route_id,
            tripId: trip.id,
            path,
            stopIds: (times.data || []).map((t) => t.stop_id),
          });
        } catch {
          if (!controller.signal.aborted) setError(true);
        }
      })();
    return () => controller.abort();
  }, [trip, onGeometry]);
  if (error)
    return (
      <Alert severity="warning">
        The boarding order and path could not load. Choose another pattern or
        retry this route.
      </Alert>
    );
  if (!details)
    return <Typography role="status">Loading boarding order…</Typography>;
  return (
    <Stack spacing={1}>
      <Box component="details"><Box component="summary" sx={{ cursor: "pointer", minHeight: 44, py: 1 }}>Service details</Box>
      <Typography variant="body2">
        {details.calendar
          ? `Published regular service: ${details.calendar}. Holiday exceptions may apply.`
          : "Operating days are not supplied for this pattern."}{" "}
        Agency timezone: America/New_York.
      </Typography>
      </Box>
      {!details.hasPath && (
        <Typography variant="body2">
          No route line is available for this direction.
        </Typography>
      )}
      <Typography component="h3" variant="h3">
        Stops in order
      </Typography>
      <List
        aria-label="Ordered stop occurrences"
        sx={{ maxHeight: 320, overflow: "auto" }}
      >
        {details.times.map((time) => {
          const stop = stops.find((s) => s.id === time.stop_id);
          return (
            <ListItem key={time.id} disablePadding>
              <ListItemButton
                disabled={!stop}
                onClick={() => onStop(time.stop_id)}
                sx={{ minHeight: 60, borderRadius: "8px", gap: 1 }}
              >
                <ListItemText
                  primary={`${time.stop_sequence}. ${stop?.name || "Stop unavailable"}`}
                  secondary={
                    time.pickup_type === 1 ? "No boarding at this occurrence" : stop ? `Stop ${stop.source_id_raw}` : undefined
                  }
                  slotProps={{ primary: { sx: { fontWeight: 600 } } }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
      {!details.times.length && (
        <Typography>No boarding order was supplied.</Typography>
      )}
    </Stack>
  );
}

export function MapStopDetails({
  stop,
  routes,
  revision,
  connected = true,
}: {
  stop: Stop;
  routes: Route[];
  revision: string;
  connected?: boolean;
}) {
  const clock = useArrivalClock();
  const [details, setDetails] = useState<{
    arrivals: Arrival[];
    trips: Tables<"transit_trips">[];
  } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(10_000),
    ]);
    const db = publicTransitClient();
    if (db)
      void (async () => {
        try {
          const now = Date.now();
          const [arrivals, occurrences] = await Promise.all([
            db
              .from("transit_arrivals")
              .select("*")
              .eq("stop_id", stop.id)
              .eq("relationship", "SCHEDULED")
              .gte("arrival_at", new Date(now).toISOString())
              .gt("valid_until", new Date(now).toISOString())
              .order("arrival_at")
              .limit(1000)
              .abortSignal(signal),
            db
              .from("transit_stop_times")
              .select("trip_id")
              .eq("stop_id", stop.id)
              .limit(1000)
              .abortSignal(signal),
          ]);
          if (controller.signal.aborted) return;
          if (
            arrivals.error ||
            occurrences.error ||
            arrivals.data?.length === 1000 ||
            occurrences.data?.length === 1000
          )
            throw new Error();
          const ids = [
            ...new Set((occurrences.data || []).map((t) => t.trip_id)),
          ];
          const trips = ids.length
            ? await db
                .from("transit_trips")
                .select("*")
                .in("id", ids)
                .eq("active", true)
                .limit(1000)
                .abortSignal(signal)
            : { data: [], error: null };
          if (controller.signal.aborted) return;
          if (trips.error || trips.data?.length === 1000) throw new Error();
          setError(false);
          setDetails({
            arrivals: (arrivals.data || [])
              .filter((a) => usableArrival(a, now))
              .slice(0, 3),
            trips: trips.data || [],
          });
        } catch {
          if (!controller.signal.aborted) setError(true);
        }
      })();
    return () => controller.abort();
  }, [stop.id, revision]);
  const serving = [
    ...new Map(
      (details?.trips || []).map((t) => [
        `${t.route_id}:${t.direction_id}:${t.headsign}`,
        t,
      ]),
    ).values(),
  ];
  return (
    <Stack component="section" aria-label="Stop details" spacing={2}>
      <Typography component="h2" variant="h2" tabIndex={-1}>
        {stop.name}
      </Typography>
      <Typography variant="body2">
        Check the direction before boarding.
      </Typography>
      {error ? (
        <Alert severity="warning">
          Stop service and arrivals are unavailable. Refresh transit data to
          retry.
        </Alert>
      ) : !details ? (
        <Typography role="status">Loading stop service…</Typography>
      ) : (
        <>
          <Typography component="h3" variant="h3">
            Upcoming arrivals
          </Typography>
          {details.arrivals.filter((a) => usableArrival(a, clock)).length ? (
            <List>
              {details.arrivals
                .filter((a) => usableArrival(a, clock))
                .map((arrival) => (
                  <ListItem key={arrival.id} sx={{ display: "block" }}>
                    <ListItemText
                      primary={`${routes.find((r) => r.id === arrival.route_id)?.long_name || "Route unavailable"} · ${transitTime(arrival.arrival_at!)}`}
                      secondary={
                        details.trips.find((t) => t.id === arrival.trip_id)
                          ?.headsign || "Direction not supplied"
                      }
                    />
                    <ArrivalStatus arrival={arrival} connected={connected} />
                  </ListItem>
                ))}
            </List>
          ) : (
            <Typography>
              No current arrival estimates are available. Try refreshing or
              check the UGA bus tracker.
            </Typography>
          )}
          <Typography component="h3" variant="h3">
            Routes & directions
          </Typography>
          {serving.length ? (
            <List>
              {serving.map((trip) => (
                <ListItem
                  key={`${trip.route_id}:${trip.direction_id}:${trip.headsign}`}
                  disablePadding
                >
                  <ListItemButton
                    component={Link}
                    href={`/map?route=${encodeURIComponent(trip.route_id)}&trip=${encodeURIComponent(trip.id)}&stop=${encodeURIComponent(stop.id)}`}
                    sx={{ minHeight: 48 }}
                  >
                    <ListItemText
                      primary={
                        routes.find((r) => r.id === trip.route_id)?.long_name ||
                        "Route unavailable"
                      }
                      secondary={trip.headsign || "Direction not supplied"}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          ) : (
            <Typography>
              No current serving route information is available.
            </Typography>
          )}
        </>
      )}
      <RiderReport
        arrivals={(details?.arrivals ?? []).map((a) => ({
          id: a.id,
          label: `${routes.find((r) => r.id === a.route_id)?.long_name || "Bus"} at ${stop.name}`,
        }))}
      />
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", "& .MuiButton-root": { whiteSpace: "normal", textAlign: "left" } }}>
        <SaveStopButton stop={stop} />
        <Button
          component={Link}
          href={`/plan?from=${encodeURIComponent(stop.id)}&fromType=stop`}
          variant="outlined"
        >
          Plan from here
        </Button>
        <Button
          component={Link}
          href={`/plan?to=${encodeURIComponent(stop.id)}`}
          variant="contained"
        >
          Plan to this stop
        </Button>
        {mapCoordinates(stop.longitude, stop.latitude) && (
          <Button
            component="a"
            href={`https://www.google.com/maps/dir/?api=1&destination=${stop.latitude},${stop.longitude}&travelmode=walking`}
            target="_blank"
            rel="noopener noreferrer"
            variant="outlined"
          >
            Walking directions ↗
          </Button>
        )}
      </Stack>
      <Box component="details"><Box component="summary" sx={{ cursor: "pointer", minHeight: 44, py: 1 }}>About this stop</Box><Typography variant="body2" color="text.secondary">Saved stops stay on this device. External walking directions use Google Maps; no continuous location history is stored by ArchRide.</Typography></Box>
    </Stack>
  );
}

export function MapPlaceDetails({
  id,
  type,
  onPlace,
}: {
  id: string;
  type: string | null;
  onPlace: (place: MapPlace) => void;
}) {
  const [place, setPlace] = useState<MapPlace | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(10_000),
    ]);
    const db = publicTransitClient();
    if (db)
      void (async () => {
        const [building, entrance] = await Promise.all([
          type !== "entrance"
            ? db
                .from("transit_buildings")
                .select("id,name,latitude,longitude")
                .eq("id", id)
                .abortSignal(signal)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          type !== "building"
            ? db
                .from("transit_entrances")
                .select("id,name,latitude,longitude")
                .eq("id", id)
                .abortSignal(signal)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);
        if (controller.signal.aborted) return;
        const rows = [building.data, entrance.data].filter(
          (p): p is MapPlace => p !== null,
        );
        if (
          !building.error &&
          !entrance.error &&
          rows.length === 1 &&
          mapCoordinates(rows[0].longitude, rows[0].latitude)
        ) {
          const found = {
            ...rows[0],
            type: building.data ? ("building" as const) : ("entrance" as const),
          };
          setPlace(found);
          onPlace(found);
        }
        setDone(true);
      })();
    return () => controller.abort();
  }, [id, type, onPlace]);
  if (type && !["building", "entrance"].includes(type))
    return (
      <Alert severity="warning">
        This campus location type is invalid. Choose a verified place.
      </Alert>
    );
  if (!done)
    return <Typography role="status">Loading campus location…</Typography>;
  if (!place)
    return (
      <Alert severity="warning">
        This campus location is unavailable or ambiguous. Choose another
        verified place.
      </Alert>
    );
  return (
    <Stack component="section" aria-label="Place details" spacing={1}>
      <Typography component="h2" variant="h2" tabIndex={-1}>
        {place.name}
      </Typography>
      <Typography>
        {place.type === "entrance"
          ? "Mapped entrance. Accessibility is unverified."
          : "Campus building"}
      </Typography>
      {place.id.startsWith("uga-oua:") && (
        <Box component="details"><Box component="summary" sx={{ cursor: "pointer", minHeight: 44, py: 1 }}>Location source</Box><Typography variant="body2">
          Campus location data:{" "}
          <a
            href="https://www.architects.uga.edu/maps"
            target="_blank"
            rel="noopener noreferrer"
          >
            UGA Office of University Architects
          </a>
          .
        </Typography></Box>
      )}
      <Button
        component={Link}
        href={`/plan?to=${encodeURIComponent(place.id)}&toType=${place.type === "entrance" ? "entrance" : "building"}`}
        variant="contained"
        sx={{ alignSelf: "flex-start", whiteSpace: "normal" }}
      >
        Plan to this place
      </Button>
    </Stack>
  );
}
