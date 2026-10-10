"use client";
import { Stack, Typography } from "@mui/material";
import { EmptyState } from "@/components/empty-state";
export default function PlanPage() {
  return (
    <Stack spacing={3}>
      <Typography component="h1" variant="h1">
        Plan a trip
      </Typography>
      <EmptyState
        title="Campus destinations are being prepared"
        description="Building-to-building planning needs verified stops, walking paths, and transit information. Trip recommendations are unavailable until those sources are ready. You will be able to choose a starting point without sharing your location."
        action="Explore the map"
        href="/map"
      />
    </Stack>
  );
}
