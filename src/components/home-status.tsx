"use client";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Alert, Box, Button, Chip, Paper, Stack, Typography } from "@mui/material";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function useOnline() {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

const sections = [
  {
    title: "Nearby stops and departures",
    body: "No stop or departure data is available yet. Arrival times appear here only when a verified source provides them.",
  },
  {
    title: "Next trip",
    body: "Choose where you're going to see a recommendation. We never show an estimate without source data.",
  },
  {
    title: "Favorites",
    body: "Your favorite places will appear here once saved places are connected.",
  },
  {
    title: "Next class",
    body: "Your next class will appear here once your schedule is connected.",
  },
  {
    title: "Alerts",
    body: "No service alerts are available. Alerts will appear here when a source is connected.",
  },
];

export function HomeStatus() {
  const online = useOnline();

  return (
    <Stack spacing={3}>
      {!online && (
        <Alert severity="warning">
          You&apos;re offline. Search and departures need a connection. Try
          again when you&apos;re back online.
        </Alert>
      )}

      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
        <Chip variant="outlined" label="Source: not connected" />
        <Chip variant="outlined" label="Last updated: unavailable" />
      </Stack>

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" },
        }}
      >
        {sections.map(({ title, body }) => (
          <Paper
            key={title}
            component="section"
            variant="outlined"
            sx={{ p: 3, bgcolor: "background.default" }}
          >
            <Typography component="h2" variant="h3" sx={{ mb: 1 }}>
              {title}
            </Typography>
            <Typography color="text.secondary">{body}</Typography>
          </Paper>
        ))}
      </Box>

      <Alert
        severity="info"
        role="status"
        action={
          <Button component={Link} href="/profile" color="inherit">
            Profile
          </Button>
        }
      >
        You&apos;re browsing as a guest. Home works without an account. Sign in
        from Profile to see your favorites and classes.
      </Alert>
    </Stack>
  );
}