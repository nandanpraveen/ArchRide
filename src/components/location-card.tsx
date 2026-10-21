"use client";
import Link from "next/link";
import { useState } from "react";
import { Alert, Button, List, ListItem, ListItemButton, ListItemText, Paper, Stack, Typography } from "@mui/material";
import MyLocationRounded from "@mui/icons-material/MyLocationRounded";
import type { Stop } from "@/lib/transit/contracts";

type LocationState =
  | { kind: "idle" | "asking" | "denied" | "unavailable" | "timeout" }
  | { kind: "found"; latitude: number; longitude: number };

function distance(latitude: number, longitude: number, stop: Stop) {
  const radians = Math.PI / 180;
  const a = Math.sin((stop.latitude - latitude) * radians / 2) ** 2 + Math.cos(latitude * radians) * Math.cos(stop.latitude * radians) * Math.sin((stop.longitude - longitude) * radians / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}

export function LocationCard({ stops }: { stops: Stop[] }) {
  const [state, setState] = useState<LocationState>({ kind: "idle" });
  function requestLocation() {
    if (!navigator.geolocation) { setState({ kind: "unavailable" }); return; }
    setState({ kind: "asking" });
    navigator.geolocation.getCurrentPosition((position) => {
      const { latitude, longitude } = position.coords;
      setState(Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { kind: "found", latitude, longitude } : { kind: "unavailable" });
    }, (error) => setState({ kind: error.code === 1 ? "denied" : error.code === 3 ? "timeout" : "unavailable" }), { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
  }
  const nearest = state.kind === "found" ? stops.map((stop) => ({ stop, meters: distance(state.latitude, state.longitude, stop) })).filter(({ meters }) => Number.isFinite(meters)).sort((a, b) => a.meters - b.meters).slice(0, 3) : [];
  const outside = nearest.length > 0 && nearest[0].meters > 5000;
  return <Paper component="section" variant="outlined" aria-labelledby="location-heading" sx={{ p: { xs: 3, sm: 4 }, bgcolor: "background.default" }}>
    <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
      <Typography component="h2" variant="h2" id="location-heading">Start from where you are</Typography>
      <Typography color="text.secondary">Optionally share your location to find nearby stops. It stays in this page&apos;s memory and is never saved or sent to the transit provider.</Typography>
      {state.kind === "found" && <Alert severity={outside ? "info" : "success"}>{outside ? "You appear to be far from the available campus stops. Choose a building or stop manually." : nearest.length ? "Got your location. These are the nearest verified stops by approximate straight-line distance, not walking distance." : "Got your location. The stop catalog is unavailable; choose a stop once it returns."}</Alert>}
      {state.kind === "denied" && <Alert severity="warning">Location is blocked for this site. You can still choose a building or stop to start from.</Alert>}
      {state.kind === "unavailable" && <Alert severity="warning">Your location isn&apos;t available right now. Try again, or choose a building or stop.</Alert>}
      {state.kind === "timeout" && <Alert severity="warning">Finding your location took too long. Try again, or choose a building or stop.</Alert>}
      {!outside && nearest.length > 0 && <List aria-label="Nearby stops" sx={{ width: "100%" }}>{nearest.map(({ stop, meters }) => <ListItem key={stop.id} disablePadding><ListItemButton component={Link} href={`/map?stop=${encodeURIComponent(stop.id)}`} sx={{ minHeight: 48 }}><ListItemText primary={stop.name} secondary={`About ${Math.round(meters)} m in a straight line`} /></ListItemButton></ListItem>)}</List>}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ width: { xs: "100%", sm: "auto" } }}>
        <Button variant="contained" startIcon={<MyLocationRounded />} onClick={requestLocation} disabled={state.kind === "asking"}>{state.kind === "asking" ? "Finding you…" : ["timeout", "unavailable"].includes(state.kind) ? "Try again" : "Use my location"}</Button>
        <Button onClick={() => document.getElementById("campus-place-search")?.focus()} variant="outlined">Choose a building or stop</Button>
      </Stack>
    </Stack>
  </Paper>;
}
