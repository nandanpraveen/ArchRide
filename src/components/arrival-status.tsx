"use client";
import { useEffect, useState } from "react";
import { Box, Typography } from "@mui/material";
import type { Arrival } from "@/lib/transit/contracts";
import { arrivalEstimate, arrivalLabel } from "@/lib/transit/estimates";
export function useArrivalClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}
export function ArrivalStatus({
  arrival,
  connected = true,
}: {
  arrival: Arrival | null;
  connected?: boolean;
}) {
  const now = useArrivalClock(),
    estimate = arrivalEstimate(arrival, now, connected);
  const age = estimate.sourceTime
    ? Math.max(0, Math.floor((now - Date.parse(estimate.sourceTime)) / 1000))
    : null;
  return (
    <Box>
      <Typography
        variant="body2"
        color={estimate.state === "valid" ? "text.primary" : "text.secondary"}
      >
        {estimate.state === "valid" ? (
          <>
            <Box
              component="strong"
              className="transit-number"
              sx={{ fontSize: "1.7rem", mr: 0.5 }}
            >
              {estimate.countdownMinutes}
            </Box>
            min{" "}
            <Box
              component="span"
              sx={{ color: "text.secondary", ml: 1, fontSize: ".75rem" }}
            >
              Estimate
              {age !== null
                ? ` · updated ${age < 60 ? age + "s" : Math.floor(age / 60) + "m"} ago`
                : ""}
            </Box>
          </>
        ) : (
          estimate.reason
        )}
      </Typography>
      <Box component="details" sx={{ mt: 0.5 }}>
        <Box
          component="summary"
          sx={{
            cursor: "pointer",
            fontSize: ".75rem",
            color: "text.secondary",
            py: 1,
          }}
        >
          About this arrival
        </Box>
        <Typography variant="caption" color="text.secondary">
          {arrivalLabel(estimate)}
        </Typography>
      </Box>
    </Box>
  );
}
