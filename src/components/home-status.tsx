"use client";
import { AgencyAlert } from "./agency-alert";
import { useSyncExternalStore } from "react";
import { Alert, Box, Button, Chip, Stack, Typography } from "@mui/material";
import type { usePublicTransit } from "@/lib/transit/public-data";
import {
  activeTransitAlerts,
  arrivalFeedConnected,
  feedFreshness,
} from "@/lib/transit/contracts";
import { transitTime } from "@/lib/transit/map-data";
import { useArrivalClock } from "./arrival-status";
const subscribe = (callback: () => void) => {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
};
export function HomeAlerts({
  transit,
}: {
  transit: ReturnType<typeof usePublicTransit>;
}) {
  const now = useArrivalClock(),
    online = useSyncExternalStore(
      subscribe,
      () => navigator.onLine,
      () => true,
    );
  const alerts = activeTransitAlerts(transit.data?.alerts ?? [], now).slice(
    0,
    3,
  );
  if (
    online &&
    transit.status !== "unavailable" &&
    !transit.data?.errors?.alerts &&
    !alerts.length
  )
    return null;
  return (
    <Stack spacing={1.5} component="section" aria-label="Service alerts">
      {!online && (
        <Alert severity="warning">
          You’re offline. Loaded information may be out of date.
        </Alert>
      )}
      {transit.status === "unavailable" && (
        <Alert
          severity="warning"
          action={
            <Button onClick={transit.retry} color="inherit">
              Retry data
            </Button>
          }
        >
          Campus data could not refresh. Try again when your connection
          improves.
        </Alert>
      )}
      {transit.data?.errors?.alerts && (
        <Alert
          severity="warning"
          action={
            <Button onClick={transit.retry} color="inherit">
              Retry alerts
            </Button>
          }
        >
          Source notices could not refresh. Other campus information is still
          available.
        </Alert>
      )}
      {!!alerts.length && (
        <Box component="details">
          <Box
            component="summary"
            sx={{
              cursor: "pointer",
              minHeight: 44,
              alignContent: "center",
              fontSize: ".875rem",
              fontWeight: 600,
            }}
          >
            Service updates ({alerts.length})
          </Box>
          <Stack spacing={1} sx={{ pt: 1 }}>
            {alerts.map((alert) => (
              <AgencyAlert key={alert.id} alert={alert} now={now} />
            ))}
          </Stack>
        </Box>
      )}
    </Stack>
  );
}
export function HomeStatus({
  transit,
}: {
  transit: ReturnType<typeof usePublicTransit>;
}) {
  const now = useArrivalClock();
  const feeds = [
    ["uga-passio:static", "Static data"],
    ["uga-passio:arrivals", "Live arrivals"],
    ["uga-passio:vehicles", "Bus positions"],
    ["uga-passio:alerts", "Service alerts"],
  ];
  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Transit data: UGA / Passio. Campus buildings and doors:{" "}
        <a
          href="https://www.architects.uga.edu/maps"
          target="_blank"
          rel="noopener noreferrer"
        >
          UGA Office of University Architects
        </a>
        . A mapped door does not establish an accessible walking route.
      </Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
        {feeds.map(([id, label]) => {
          const feed = transit.data?.health.find((f) => f.id === id);
          return (
            <Chip
              key={id}
              size="small"
              variant="outlined"
              label={`${label}: ${feed?.error_code === "partial_rejection" && arrivalFeedConnected(feed, now) ? "partially available" : feed ? feedFreshness(feed, now) : "unavailable"}`}
            />
          );
        })}
      </Stack>
      <Typography variant="body2" color="text.secondary">
        {transit.data?.stops.length ?? 0} verified stops are available. Live
        estimates expire according to their source timestamps.
      </Typography>
      {transit.data?.health.find((f) => f.id.endsWith(":static"))
        ?.last_success_at && (
        <Typography variant="caption" color="text.secondary">
          Campus transit catalog updated{" "}
          {transitTime(
            transit.data.health.find((f) => f.id.endsWith(":static"))!
              .last_success_at!,
          )}
          .
        </Typography>
      )}
      <Box>
        <Button onClick={transit.retry}>Refresh transit data</Button>
        <Button
          component="a"
          href="https://routes.uga.edu/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open UGA bus tracker ↗
        </Button>
      </Box>
    </Stack>
  );
}
