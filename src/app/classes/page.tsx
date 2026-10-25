"use-client";
import React from "react";
import {
  Alert,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { EmptyState } from "@/components/empty-state";
const page = () => {
  return (
    <Stack spacing={3}>
      <Typography component="h1" variant="h1">
        Set up your class schedule here
      </Typography>
      <EmptyState
        title="Trip recommendations are not available yet"
        description="Planning needs verified walking paths and usable transit arrivals. Your selected places are shown above; no journey times or bus recommendations are being estimated."
        action="Explore the map"
        href="/map"
      />
    </Stack>
  );
};

export default page;
