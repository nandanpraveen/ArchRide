"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Alert, Box, Button, Chip, Paper, Stack, Typography } from "@mui/material";
import type { usePublicTransit } from "@/lib/transit/public-data";
import { activeTransitAlerts, feedFreshness, freshness, STATIC_STALE_SECONDS } from "@/lib/transit/contracts";
import { transitTime } from "@/lib/transit/map-data";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function HomeStatus({ transit }: { transit: ReturnType<typeof usePublicTransit> }) {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  const clock = now;
  const { data, status, reason, retry } = transit;
  const errors = data?.errors;
  const catalog = data?.health.find((feed) => feed.id.endsWith(":static"));
  const campus = data?.health.find((feed) => feed.id === "uga-campus:catalog");
  const arrivals = data?.health.find((feed) => feed.id.endsWith(":arrivals"));
  const alertsFeed = data?.health.find((feed) => feed.id.endsWith(":alerts"));
  const alerts = activeTransitAlerts(data?.alerts ?? [], clock);
  const sections = [
    { title: "Campus catalog", body: data?.stops.length ? `${data.stops.length} verified stops are available. Choose a starting point for nearby stops and source departures, or browse boarding details on the map.` : "No stop or departure data is available. Retry data or use the map directory when the catalog returns." },
    { title: "Favorites", body: "Your favorite places will appear here once saved places are connected. Open Saved to check availability." },
    { title: "Next class", body: "Your next class will appear here once your schedule is connected." },
  ];
  const arrivalState = errors?.health ? "unavailable" : arrivals ? feedFreshness(arrivals, clock) : "unavailable";
  return <Stack spacing={3}>
    {!online && <Alert severity="warning">You&apos;re offline. Search and departures need a connection. Last loaded information may be stale.</Alert>}
    {status === "loading" && <Typography role="status">Loading campus transit…</Typography>}
    {status === "unavailable" && <Alert severity="warning" action={<Button color="inherit" onClick={retry}>Retry data</Button>}>{reason}{data && " Available parts of the last snapshot remain visible; check their update times."}</Alert>}
    {Object.entries(errors ?? {}).filter(([part]) => part !== "routes" && part !== "stops").map(([part, message]) => <Alert key={part} severity="warning" action={<Button color="inherit" onClick={retry}>Retry {part}</Button>}>{message} Last loaded {part} may be stale; other campus data remains available.</Alert>)}
    <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
      <Chip variant="outlined" label={catalog?.last_success_at ? "Source: UGA / Passio" : "Source: unavailable"} />
      <Chip variant="outlined" label={`Static data: ${errors?.health ? "unknown" : catalog ? feedFreshness(catalog, clock) : "unavailable"}`} />
      <Chip variant="outlined" label={`Live arrivals: ${errors?.health ? "unknown" : arrivalState}`} />
      {campus && <Chip variant="outlined" label={`Campus places: ${errors?.health ? "unknown" : campus.state === "healthy" ? freshness(campus.last_success_at, STATIC_STALE_SECONDS, clock) : campus.last_success_at ? "stale" : "unavailable"}`} />}
    </Stack>
    <Typography variant="body2" color="text.secondary">{catalog?.last_success_at ? `Catalog updated ${transitTime(catalog.last_success_at)}. Transit data provided by UGA and Passio.` : "Catalog update time is unavailable."}</Typography>
    {campus?.last_success_at && <Typography variant="body2" color="text.secondary">Campus building and door catalog synced {transitTime(campus.last_success_at)}. Source: UGA Office of University Architects.</Typography>}
    {arrivalState !== "current" && <Alert severity="info">Live arrivals are stale or unavailable. Boarding details remain useful; no journey estimate is implied by a source prediction.</Alert>}
    <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" } }}>
      {sections.map(({ title, body }) => <Paper key={title} component="section" variant="outlined" sx={{ p: 3, bgcolor: "background.default" }}>
        <Typography component="h2" variant="h3" sx={{ mb: 1 }}>{title}</Typography>
        <Typography color="text.secondary">{body}</Typography>
        {title === "Campus catalog" && <Button component={Link} href="/map">Browse boarding stops</Button>}
        {title === "Favorites" && <Button component={Link} href="/saved">Open favorites and saved journeys</Button>}
      </Paper>)}
    </Box>
    <Box component="section" aria-label="Service alerts">
      <Typography component="h2" variant="h3" sx={{ mb: 1 }}>Alerts</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Alert feed: {errors?.health || errors?.alerts ? "unavailable" : alertsFeed ? feedFreshness(alertsFeed, clock) : "unavailable"}. Source notices below retain their original update times and route or stop descriptions.</Typography>
      {alerts.length ? alerts.map((alert) => <Alert key={alert.id} severity="warning" sx={{ mb: 1 }}><strong>{alert.header || "Transit alert"}</strong> {alert.description} · {freshness(alert.source_timestamp, undefined, clock)} source notice · updated {transitTime(alert.source_timestamp)}</Alert>) : <Typography color="text.secondary">{errors?.alerts ? "Source notices could not refresh. Check the official tracker for current service information." : "No active source notices are in the loaded snapshot. This does not guarantee normal service."}</Typography>}
    </Box>
    <Alert severity="info" role="status" action={<Button component={Link} href="/profile" color="inherit">Profile</Button>}>You&apos;re browsing as a guest. Public transit browsing works without an account. Account, saved journeys, and class features are being connected by their feature owners.</Alert>
  </Stack>;
}
