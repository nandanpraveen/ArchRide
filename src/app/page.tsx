"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert, Box, Button, Link as MuiLink, Stack, Typography } from "@mui/material";
import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import { PlaceSearch } from "@/components/place-search";
import { LocationCard } from "@/components/location-card";
import { HomeStatus } from "@/components/home-status";
import { HomeDepartures } from "@/components/home-departures";
import { HomeFavorites } from "@/components/home-favorites";
import { homePlaceHref, homePlanHref, type HomeOrigin } from "@/components/home-journey";
import type { Place } from "@/lib/campus-data";
import { usePublicTransit } from "@/lib/transit/public-data";

const shortcuts = [
  { href: "/map", label: "Explore the campus map" },
  { href: "/saved", label: "Open your saved journeys" },
  { href: "/profile", label: "Manage travel preferences" },
];

export default function HomePage() {
  const transit = usePublicTransit();
  const [origin, setOrigin] = useState<HomeOrigin | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);

  return <Stack spacing={4}>
    <Box>
      <Typography component="h1" variant="h1" sx={{ maxWidth: "18ch", mb: 2 }}>Where are you headed?</Typography>
      <Typography color="text.secondary" sx={{ maxWidth: "55ch" }}>Find your way across campus, with the bus and the walk in one place.</Typography>
    </Box>
    <Box component="section" aria-label="Choose a destination">
      <PlaceSearch onSelect={setDestination} />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Campus buildings and doors: <MuiLink href="https://www.architects.uga.edu/maps" target="_blank" rel="noopener noreferrer">UGA Office of University Architects ↗</MuiLink>. A mapped door does not establish an accessible walking route.</Typography>
      {destination && <Stack spacing={1} sx={{ mt: 2 }}>
        <Typography role="status" sx={{ overflowWrap: "anywhere" }}>Destination: {destination.name}</Typography>
        <Button component={Link} href={homePlaceHref(destination)} sx={{ alignSelf: "flex-start" }}>View destination details</Button>
      </Stack>}
    </Box>
    <LocationCard origin={origin} onOrigin={setOrigin} />
    <HomeDepartures origin={origin} transit={transit} />
    <HomeFavorites />
    <Box component="section" aria-label="Next trip">
      <Typography component="h2" variant="h2" sx={{ mb: 1 }}>Your next trip</Typography>
      <Typography color="text.secondary">{origin && destination ? "Your starting point and destination are selected. " : "Choose a starting point and destination. "}Trip recommendations need a connected walking and journey-planning service; available departures alone do not establish that you can catch a bus.</Typography>
      {origin && destination && <Alert severity="info" sx={{ mt: 2 }}>No journey recommendation is available yet. You can review the selected places in Plan.</Alert>}
      <Button component={Link} href={homePlanHref(origin, destination)} variant="contained" sx={{ mt: 2 }}>Review trip in Plan</Button>
    </Box>
    <HomeStatus transit={transit} />
    <Box component="section">
      <Typography component="h2" variant="h2" sx={{ mb: 2 }}>Your campus, at a glance</Typography>
      <Stack divider={<Box sx={{ borderBottom: 1, borderColor: "divider" }} />}>
        {shortcuts.map(({ href, label }) => <Button key={href} component={Link} href={href} endIcon={<ArrowForwardRounded />} sx={{ justifyContent: "space-between", px: 0, py: 2, borderRadius: 0 }}>{label}</Button>)}
      </Stack>
    </Box>
  </Stack>;
}
