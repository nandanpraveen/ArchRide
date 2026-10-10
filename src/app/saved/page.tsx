"use client";
import { Stack, Typography } from "@mui/material";
import { EmptyState } from "@/components/empty-state";
export default function SavedPage() {
  return (
    <Stack spacing={3}>
      <Typography component="h1" variant="h1">
        Saved journeys
      </Typography>
      <EmptyState
        title="Keep your usual trips close"
        description="Your favorite stops and named journeys will live here. Saved journeys will always use fresh recommendations when opened."
      />
    </Stack>
  );
}
