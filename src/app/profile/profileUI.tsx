"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
import { Alert, Button, Stack, TextField, Typography } from "@mui/material";
import { NotificationSettings } from "@/components/notification-settings";
import { signOut } from "./actions";

function SignOutButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outlined" disabled={pending}>
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}

export default function ProfileUI({
  userSignedIn,
  userEmail,
  unavailable,
  signOutFailed,
}: {
  userSignedIn: boolean;
  userEmail: string;
  unavailable: boolean;
  signOutFailed: boolean;
}) {
  return (
    <Stack spacing={3} sx={{ maxWidth: 600 }}>
      <Typography component="h1" variant="h1">
        Profile
      </Typography>
      {unavailable && (
        <Alert severity="warning">
          Account services are temporarily unavailable. Public transit browsing
          remains available. Refresh this page to try again.
        </Alert>
      )}
      {signOutFailed && (
        <Alert severity="error">
          Sign-out could not be confirmed. Please try again.
        </Alert>
      )}
      {userSignedIn ? (
        <>
          <TextField
            label="Email"
            value={userEmail}
            slotProps={{ input: { readOnly: true } }}
          />
          <form action={signOut}>
            <SignOutButton />
          </form>
          <Typography color="text.secondary">
            You are signed in. Saved journeys, classes and personal travel
            preferences will appear here when their project features are
            connected.
          </Typography>
          <Button component={Link} href="/saved">
            View saved journeys
          </Button>
          <Button component={Link} href="/classes">
            Edit class schedule
          </Button>
        </>
      ) : (
        <>
          {!unavailable && (
            <Alert severity="info">
              You are browsing as a guest. Public transit information is
              available without an account.
            </Alert>
          )}
          <Typography color="text.secondary">
            Sign in to your ArchRide account. Personal preferences and saved
            journeys are being connected by their project owners.
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <Button component={Link} href="/sign-in" variant="contained">
              Sign in
            </Button>
            <Button component={Link} href="/create-account" variant="outlined">
              Create account
            </Button>
          </Stack>
          <Button component={Link} href="/classes" sx={{ alignSelf: "flex-start" }}>
            Class schedule (saved on this device)
          </Button>
        </>
      )}
      <NotificationSettings />
      <Typography variant="body2" color="text.secondary">
        Location sharing is optional. GPS coordinates stay in Home page memory;
        ArchRide does not store a continuous location trail.
      </Typography>
      <Button component={Link} href="/">
        Back to Home
      </Button>
    </Stack>
  );
}
