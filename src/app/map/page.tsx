"use client";
import { Stack, Typography } from "@mui/material";
import { EmptyState } from "@/components/empty-state";
export default function MapPage() {
  return (
    <Stack spacing={3}>
      <Typography component="h1" variant="h1">
        Campus map
      </Typography>
      <EmptyState
        title="Waiting for verified transit data"
        description="Routes, boarding stops, and bus positions will appear here once the transit source is connected. No vehicle positions are available right now."
        action="Back to Home"
        href="/"
      />
    </Stack>
  );
}
