"use client";
import Link from "next/link";
import { useState } from "react";
import { Alert, Button, Paper, Stack, Typography } from "@mui/material";
import MyLocationRounded from "@mui/icons-material/MyLocationRounded";

type LocationState =
  | { kind: "idle" }
  | { kind: "asking" }
  | { kind: "found"; latitude: number; longitude: number }
  | { kind: "denied" }
  | { kind: "unavailable" }
  | { kind: "timeout" }
  | { kind: "outside" };

// Rough box around the UGA campus. Replace with the real supported area
// once task 2 publishes it.
const CAMPUS = { south: 33.92, north: 33.985, west: -83.42, east: -83.33 };

function insideCampus(latitude: number, longitude: number) {
  return (
    latitude >= CAMPUS.south &&
    latitude <= CAMPUS.north &&
    longitude >= CAMPUS.west &&
    longitude <= CAMPUS.east
  );
}

export function LocationCard() {
  const [state, setState] = useState<LocationState>({ kind: "idle" });

  function requestLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({ kind: "unavailable" });
      return;
    }
    setState({ kind: "asking" });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setState(
          insideCampus(latitude, longitude)
            ? { kind: "found", latitude, longitude }
            : { kind: "outside" },
        );
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setState({ kind: "denied" });
        } else if (error.code === error.TIMEOUT) {
          setState({ kind: "timeout" });
        } else {
          setState({ kind: "unavailable" });
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }

  const canRetry =
    state.kind === "timeout" ||
    state.kind === "unavailable" ||
    state.kind === "outside";

  return (
    <Paper
      component="section"
      variant="outlined"
      aria-labelledby="location-heading"
      sx={{ p: { xs: 3, sm: 4 }, bgcolor: "background.default" }}
    >
      <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
        <Typography component="h2" variant="h2" id="location-heading">
          Start from where you are
        </Typography>
        <Typography color="text.secondary" sx={{ maxWidth: "60ch" }}>
          Share your location to see nearby stops. This is optional. Your
          location is used only while this page is open and is never saved.
        </Typography>

        {state.kind === "found" && (
          <Alert severity="success" sx={{ width: "100%" }}>
            Got your location. Nearby stops will appear here once campus
            transit data is connected.
          </Alert>
        )}
        {state.kind === "denied" && (
          <Alert severity="warning" sx={{ width: "100%" }}>
            Location is blocked for this site. You can still choose a building
            or stop to start from.
          </Alert>
        )}
        {state.kind === "unavailable" && (
          <Alert severity="warning" sx={{ width: "100%" }}>
            Your location isn&apos;t available right now. Try again, or choose a
            building or stop to start from.
          </Alert>
        )}
        {state.kind === "timeout" && (
          <Alert severity="warning" sx={{ width: "100%" }}>
            Finding your location took too long. Try again, or choose a
            building or stop to start from.
          </Alert>
        )}
        {state.kind === "outside" && (
          <Alert severity="info" sx={{ width: "100%" }}>
            You appear to be outside the UGA campus area. Choose a building or
            stop to start from.
          </Alert>
        )}

        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          sx={{ width: { xs: "100%", sm: "auto" } }}
        >
          {state.kind !== "found" && state.kind !== "denied" && (
            <Button
              variant="contained"
              startIcon={<MyLocationRounded />}
              onClick={requestLocation}
              disabled={state.kind === "asking"}
            >
              {state.kind === "asking"
                ? "Finding you…"
                : canRetry
                  ? "Try again"
                  : "Use my location"}
            </Button>
          )}
          <Button component={Link} href="/plan" variant="outlined">
            Choose a building or stop
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}