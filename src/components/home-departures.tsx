"use client";

import Link from "next/link";
import { ArrivalStatus } from "./arrival-status";
import { useEffect, useState } from "react";
import { Alert, Box, Button, List, ListItem, Stack, Typography } from "@mui/material";
import { arrivalFeedConnected, feedFreshness, usableArrival } from "@/lib/transit/contracts";
import { publicTransitClient, type usePublicTransit } from "@/lib/transit/public-data";
import { readHomeDepartures } from "@/lib/transit/read";
import { transitTime } from "@/lib/transit/map-data";
import { nearestHomeStops, type HomeOrigin } from "./home-journey";

type Departures = Awaited<ReturnType<typeof readHomeDepartures>>;

export function HomeDepartures({ origin, transit }: {
  origin: HomeOrigin | null;
  transit: ReturnType<typeof usePublicTransit>;
}) {
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [result, setResult] = useState<{ key: string; data: Departures } | null>(null);
  const nearest = nearestHomeStops(transit.data?.stops ?? [], origin);
  const outside = nearest.length > 0 && nearest[0].meters > 5000;
  const ids = JSON.stringify(outside ? [] : nearest.map(({ stop }) => stop.id));
  const feed = transit.data?.health.find((item) => item.id.endsWith(":arrivals"));
  // Partial ingestion can update valid predictions without advancing the success clock.
  const sourceClock = `${feed?.source_timestamp ?? ""}:${feed?.last_success_at ?? ""}:${feed?.last_attempt_at ?? ""}:${feed?.updated_at ?? ""}`;
  const key = `${ids}:${sourceClock}:${revision}`;
  const current = result?.key === key ? result.data : null;

  useEffect(() => {
    // Expiry is a source-clock rule, independent of successful network refreshes.
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const stopIds = JSON.parse(ids) as string[];
    if (!stopIds.length) return;
    const controller = new AbortController();
    const requestKey = `${ids}:${sourceClock}:${revision}`;
    const db = publicTransitClient();
    if (!db) return;
    void readHomeDepartures(db, stopIds, undefined, controller.signal).then((data) => {
      if (!controller.signal.aborted) setResult({ key: requestKey, data });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ key: requestKey, data: stopIds.map((stopId) => ({ stopId, arrivals: [], error: true })) });
    });
    return () => controller.abort();
  }, [ids, sourceClock, revision]);

  const clock = now;
  const liveState = transit.data?.errors?.health ? "unavailable" : feed ? feedFreshness(feed, clock) : "unavailable";
  return <Box component="section" aria-labelledby="home-departures-heading">
    <Stack spacing={2}>
      <Typography component="h2" variant="h2" id="home-departures-heading">Nearby stops and departures</Typography>
      {!origin ? <Typography color="text.secondary">Choose your starting building or stop, or use your location, to see nearby boarding points and available source departures.</Typography>
        : transit.status === "loading" && !transit.data ? <Typography role="status">Loading nearby stops…</Typography>
        : !nearest.length ? <Typography color="text.secondary">No nearby stops can be shown without verified origin coordinates and the stop catalog. Choose another starting point or retry campus data.</Typography>
        : outside ? <Alert severity="info">You appear to be far from the available campus stops. Choose a building or stop manually.</Alert>
        : <>
          <Typography variant="body2" color="text.secondary">Approximate straight-line distances from your starting point. These are not verified walking routes or reachable-bus recommendations.</Typography>
          {liveState !== "current" && <Alert severity="info">{liveState === "stale" ? "The arrival feed is stale." : "The arrival feed is unavailable."} Only source predictions that are still valid appear below. Missing predictions do not establish that service is cancelled.</Alert>}
          {!current && <Typography role="status">Loading source departures…</Typography>}
          <List aria-label="Nearby stops" disablePadding>
            {nearest.map(({ stop, meters }) => {
              const entry = current?.find((item) => item.stopId === stop.id);
              const arrivals = entry?.arrivals.filter((arrival) => usableArrival(arrival, clock)) ?? [];
              return <ListItem key={stop.id} disableGutters sx={{ display: "block", py: 2, borderBottom: 1, borderColor: "divider" }}>
                <Stack spacing={1}>
                  <Typography component="h3" variant="h3" sx={{ overflowWrap: "anywhere" }}>{stop.name}</Typography>
                  <Typography variant="body2" color="text.secondary">About {Math.round(meters)} m in a straight line · {stop.latitude.toFixed(5)}, {stop.longitude.toFixed(5)}</Typography>
                  {entry?.error && <Alert severity="warning">Some departure details for this stop could not load. Other stops remain available.</Alert>}
                  {current && !entry?.error && !arrivals.length && <Typography color="text.secondary">No current source departures are supplied for this stop. This does not mean there are no buses or that the route is cancelled.</Typography>}
                  {arrivals.map((arrival) => <Box key={arrival.id} sx={{ pl: 0 }}>
                      <Typography>{transit.data?.routes.find((route) => route.id === arrival.route_id)?.long_name || transit.data?.routes.find((route) => route.id === arrival.route_id)?.short_name || "Route unavailable"} · {transitTime(arrival.arrival_at!)}</Typography>
                      <Typography variant="body2" color="text.secondary">{arrival.headsign || "Direction not supplied"}{arrival.direction_id !== null ? ` · direction ${arrival.direction_id}` : ""} · stop occurrence {arrival.stop_sequence}</Typography>
                      <ArrivalStatus arrival={arrival} connected={!transit.data?.errors?.health && arrivalFeedConnected(feed, clock)} />
                    </Box>)}
                  <Button component={Link} href={`/map?stop=${encodeURIComponent(stop.id)}`} sx={{ alignSelf: "flex-start" }}>View {stop.name} details</Button>
                </Stack>
              </ListItem>;
            })}
          </List>
          {current && <Button onClick={() => setRevision((value) => value + 1)} sx={{ alignSelf: "flex-start" }}>Refresh departures</Button>}
        </>}
    </Stack>
  </Box>;
}
