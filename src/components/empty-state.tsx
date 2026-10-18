"use client";
import Link from "next/link";
import { Button, Paper, Stack, Typography } from "@mui/material";
import DirectionsBusRounded from "@mui/icons-material/DirectionsBusRounded";
export function EmptyState({
  title,
  description,
  action = "Plan a trip",
  href = "/plan",
}: {
  title: string;
  description: string;
  action?: string;
  href?: string;
}) {
  return (
    <Paper
      component="section"
      variant="outlined"
      sx={{ p: { xs: 3, sm: 4 }, bgcolor: "background.default" }}
    >
      <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
        <DirectionsBusRounded color="primary" sx={{ fontSize: 40 }} />
        <Typography component="h2" variant="h2">
          {title}
        </Typography>
        <Typography color="text.secondary" sx={{ maxWidth: "60ch" }}>
          {description}
        </Typography>
        ``{" "}
        <Button component={Link} href={href} variant="contained">
          {action}
        </Button>
      </Stack>
    </Paper>
  );
}
