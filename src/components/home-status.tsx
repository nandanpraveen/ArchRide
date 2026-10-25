"use client";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Alert, Box, Button, Chip, Paper, Stack, Typography } from "@mui/material";
import type { usePublicTransit } from "@/lib/transit/public-data";
import { activeTransitAlerts, feedFreshness, freshness } from "@/lib/transit/contracts";
import { transitTime } from "@/lib/transit/map-data";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => { window.removeEventListener("online", callback); window.removeEventListener("offline", callback); };
}

export function HomeStatus({ transit }: { transit: ReturnType<typeof usePublicTransit> }) {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  const { data, status, reason, retry } = transit;
  const catalog = data?.health.find((feed) => feed.id.endsWith(":static"));
  const arrivals = data?.health.find((feed) => feed.id.endsWith(":arrivals"));
  const alerts = activeTransitAlerts(data?.alerts ?? []);
  const sections = [
    { title: "Campus stops and departures", body: data?.stops.length ? `${data.stops.length} verified stops are available. Choose a stop on the map for serving routes and any current source arrivals.` : "No stop or departure data is available. Retry data or use the map directory when the catalog returns." },
    { title: "Next trip", body: "Choose a destination to view its details. Trip recommendations need verified walking paths and current transit arrivals; planning is not available yet." },
    { title: "Next class", body: "Your next class will appear here once your schedule is connected." },
  ];
  return <Stack spacing={3}>
    {!online && <Alert severity="warning">You&apos;re offline. Search and departures need a connection. Last loaded information may be stale.</Alert>}
    {status === "loading" && <Typography role="status">Loading campus transit…</Typography>}
    {status === "unavailable" && <Alert severity="warning" action={<Button color="inherit" onClick={retry}>Retry data</Button>}>{reason}{data && " Showing the last loaded snapshot; it may be stale."}</Alert>}
    <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
      <Chip variant="outlined" label={catalog?.last_success_at ? "Source: UGA / Passio" : "Source: unavailable"} />
      <Chip variant="outlined" label={`Static data: ${catalog ? feedFreshness(catalog) : "unavailable"}`} />
      <Chip variant="outlined" label={`Live arrivals: ${arrivals ? feedFreshness(arrivals) : "unavailable"}`} />
    </Stack>
    <Typography variant="body2" color="text.secondary">{catalog?.last_success_at ? `Catalog updated ${transitTime(catalog.last_success_at)}. Transit data provided by UGA and Passio.` : "Catalog update time is unavailable."}</Typography>
    {(!arrivals || feedFreshness(arrivals) !== "current") && <Alert severity="info">Live arrivals are stale or unavailable. No live countdowns or journey estimates are being invented.</Alert>}
    <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" } }}>
      {sections.map(({ title, body }) => <Paper key={title} component="section" variant="outlined" sx={{ p: 3, bgcolor: "background.default" }}>
        <Typography component="h2" variant="h3" sx={{ mb: 1 }}>{title}</Typography><Typography color="text.secondary">{body}</Typography>
        {title === "Campus stops and departures" && <Button component={Link} href="/map">Browse boarding stops</Button>}
      </Paper>)}
    </Box>
    <Box component="section" aria-label="Service alerts">
      <Typography component="h2" variant="h3" sx={{ mb: 1 }}>Alerts</Typography>
      {alerts.length ? alerts.map((alert) => <Alert key={alert.id} severity="warning" sx={{ mb: 1 }}><strong>{alert.header || "Transit alert"}</strong> {alert.description} · {freshness(alert.source_timestamp)} source notice · updated {transitTime(alert.source_timestamp)}</Alert>) : <Typography color="text.secondary">No active source notices are in the loaded snapshot. This does not guarantee normal service.</Typography>}
    </Box>
    <Alert severity="info" role="status" action={<Button component={Link} href="/profile" color="inherit">Profile</Button>}>You&apos;re browsing as a guest. Public transit browsing works without an account. Account and saved features are being connected.</Alert>
  </Stack>;
}
