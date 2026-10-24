"use client";

import { useRef, useState } from "react";
import { Alert, Box, Button, Paper, Stack, Typography } from "@mui/material";
import MyLocationRounded from "@mui/icons-material/MyLocationRounded";
import { PlaceSearch } from "./place-search";
import type { HomeOrigin } from "./home-journey";
import { mapCoordinates } from "@/lib/transit/map-data";

type LocationState = "idle" | "asking" | "denied" | "unavailable" | "timeout";

export function LocationCard({ origin, onOrigin }: {
  origin: HomeOrigin | null;
  onOrigin: (origin: HomeOrigin | null) => void;
}) {
  const [state, setState] = useState<LocationState>("idle");
  const [manual, setManual] = useState(false);
  const request = useRef(0);

  function requestLocation() {
    if (!navigator.geolocation) { setState("unavailable"); return; }
    const revision = ++request.current;
    setState("asking");
    navigator.geolocation.getCurrentPosition((position) => {
      if (request.current !== revision) return;
      const { latitude, longitude } = position.coords;
      if (!mapCoordinates(longitude, latitude)) { setState("unavailable"); return; }
      onOrigin({ kind: "gps", latitude, longitude });
      setState("idle");
      setManual(false);
    }, (error) => {
      if (request.current === revision) setState(error.code === 1 ? "denied" : error.code === 3 ? "timeout" : "unavailable");
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
  }

  return <Paper component="section" variant="outlined" aria-labelledby="location-heading" sx={{ p: { xs: 3, sm: 4 }, bgcolor: "background.default" }}>
    <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
      <Typography component="h2" variant="h2" id="location-heading">Start from where you are</Typography>
      <Typography color="text.secondary">Optionally share your location to find nearby stops, or choose a verified building or stop. Your location stays in this page&apos;s memory and is never saved or sent to the transit provider.</Typography>
      {origin && <Typography role="status" sx={{ overflowWrap: "anywhere" }}>Starting point: {origin.kind === "place" ? origin.place.name : "Current location"}</Typography>}
      {origin?.kind === "gps" && <Alert severity="success">Got your location. Nearby stops use approximate straight-line distances, not walking directions.</Alert>}
      {state === "denied" && <Alert severity="warning">Location is blocked for this site. You can still choose a building or stop to start from.</Alert>}
      {state === "unavailable" && <Alert severity="warning">Your location isn&apos;t available right now. Try again, or choose a building or stop.</Alert>}
      {state === "timeout" && <Alert severity="warning">Finding your location took too long. Try again, or choose a building or stop.</Alert>}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ width: { xs: "100%", sm: "auto" } }}>
        <Button variant="contained" startIcon={<MyLocationRounded />} onClick={requestLocation} disabled={state === "asking"}>{state === "asking" ? "Finding you…" : ["timeout", "unavailable"].includes(state) ? "Try again" : "Use my location"}</Button>
        <Button onClick={() => { request.current++; setState("idle"); setManual(true); window.setTimeout(() => document.getElementById("home-origin-search")?.focus(), 0); }} variant="outlined">Choose a building or stop</Button>
      </Stack>
      {manual && <Box sx={{ width: "100%" }}>
        <PlaceSearch label="Choose your starting building or stop" inputId="home-origin-search" onSelect={(place) => {
          request.current++;
          setState("idle");
          onOrigin(place ? { kind: "place", place } : null);
        }} />
      </Box>}
    </Stack>
  </Paper>;
}
