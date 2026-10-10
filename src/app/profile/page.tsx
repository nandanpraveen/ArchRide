"use client";
import { Alert, Stack, Typography } from "@mui/material";
import { EmptyState } from "@/components/empty-state";
export default function ProfilePage() {
  return (
    <Stack spacing={3}>
      <Typography component="h1" variant="h1">
        Profile
      </Typography>
      <Alert severity="info">
        You are browsing as a guest. Public transit information will be
        available without an account.
      </Alert>
      <EmptyState
        title="Travel your way"
        description="Account sign-in and personal preferences are being prepared. Your class schedule and saved journeys will be private, and location sharing will always be optional."
        action="Back to Home"
        href="/"
      />
    </Stack>
  );
}
