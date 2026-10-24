"use client";

import Link from "next/link";
import { Alert, Button, Stack, Typography } from "@mui/material";

export default function AuthCodeErrorPage() {
  return <Stack spacing={3} sx={{ maxWidth: 560 }}>
    <Typography component="h1" variant="h1">This sign-in link could not be verified</Typography>
    <Alert severity="warning">The link may have expired, already been used, or been opened in a different browser. Request a new link and open it in the browser where you started.</Alert>
    <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
      <Button component={Link} href="/sign-in" variant="contained">Sign in</Button>
      <Button component={Link} href="/create-account">Resend confirmation</Button>
      <Button component={Link} href="/forgot-password">Reset password</Button>
    </Stack>
    <Button component={Link} href="/">Continue as guest</Button>
  </Stack>;
}
