"use client";
import Link from "next/link";
import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import { EmptyState } from "@/components/empty-state";
import { PlaceSearch } from "@/components/place-search";
   import { LocationCard } from "@/components/location-card";
      import { HomeStatus } from "@/components/home-status";

const shortcuts = [
  { href: "/map", label: "Explore the campus map" },
  { href: "/saved", label: "Open your saved journeys" },
  { href: "/profile", label: "Manage travel preferences" },
];

export default function HomePage() {
  return (
    <Stack spacing={4}>
      <Box>
        <Typography
          component="h1"
          variant="h1"
          sx={{ maxWidth: "18ch", mb: 2 }}
        >
          Where are you headed?
        </Typography>
        <Typography color="text.secondary" sx={{ maxWidth: "55ch" }}>
          Find your way across campus, with the bus and the walk in one place.
        </Typography>
      </Box>
      <PlaceSearch />
      <LocationCard />
      <HomeStatus />
      <Alert severity="info">
        Transit data is not connected yet. Live positions and arrival estimates
        are unavailable.
      </Alert>
      <EmptyState
        title="Your next trip starts here"
        description="Choose a campus destination to compare a direct bus journey with walking. Recommendations will appear when verified campus and transit data are available."
      />
      <Box component="section">
        <Typography component="h2" variant="h2" sx={{ mb: 2 }}>
          Your campus, at a glance
        </Typography>
        <Stack
          divider={<Box sx={{ borderBottom: 1, borderColor: "divider" }} />}
        >
          {shortcuts.map(({ href, label }) => (
            <Button
              key={href}
              component={Link}
              href={href}
              endIcon={<ArrowForwardRounded />}
              sx={{
                justifyContent: "space-between",
                px: 0,
                py: 2,
                borderRadius: 0,
              }}
            >
              {label}
            </Button>
          ))}
        </Stack>
      </Box>
    </Stack>
  );
}