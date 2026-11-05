"use client";
import { Alert, Box, Typography } from "@mui/material";
import type { Tables } from "@/lib/supabase/database.types";
import { freshness } from "@/lib/transit/contracts";
import { FRESH_SECONDS } from "@/lib/transit/policy";
import { transitTime } from "@/lib/transit/map-data";
import { useArrivalClock } from "./arrival-status";

export function AgencyAlert({
  alert,
  now,
  onClose,
}: {
  alert: Tables<"transit_alerts">;
  now?: number;
  onClose?: () => void;
}) {
  const clock = useArrivalClock();
  return (
    <Alert
      severity="warning"
      onClose={onClose}
      sx={{
        bgcolor: "background.paper",
        color: "text.primary",
        border: 1,
        borderColor: "divider",
        py: 0.5,
        "& .MuiAlert-message": { minWidth: 0, width: "100%" },
      }}
    >
      <Box component="details">
        <Box
          component="summary"
          sx={{
            cursor: "pointer",
            minHeight: 44,
            alignContent: "center",
            fontWeight: 700,
            overflowWrap: "anywhere",
          }}
        >
          {alert.header || "Service update"}
        </Box>
        <Typography
          variant="body2"
          sx={{ mt: 1, whiteSpace: "pre-line", overflowWrap: "anywhere" }}
        >
          {alert.description}
        </Typography>
        <Typography variant="caption" sx={{ display: "block", mt: 1 }}>
          {freshness(
            alert.source_timestamp,
            FRESH_SECONDS.alerts,
            now ?? clock,
          ) === "current"
            ? "Source notice"
            : "This notice may be out of date"}{" "}
          · updated {transitTime(alert.source_timestamp)}.
        </Typography>
      </Box>
    </Alert>
  );
}
