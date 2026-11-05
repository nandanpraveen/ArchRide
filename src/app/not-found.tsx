"use client";
import Link from "next/link";
import { Button, Stack, Typography } from "@mui/material";

export default function NotFound() {
  return <Stack spacing={2} sx={{ maxWidth: 520 }}>
    <Typography component="h1" variant="h1">Page not found</Typography>
    <Typography color="text.secondary">This page is no longer available. You can use ArchRide without an account.</Typography>
    <Button component={Link} href="/" variant="contained" sx={{ alignSelf: "flex-start" }}>Go to Home</Button>
  </Stack>;
}
