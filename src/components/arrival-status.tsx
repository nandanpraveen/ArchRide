"use client";
import { useEffect, useState } from "react";
import { Typography } from "@mui/material";
import type { Arrival } from "@/lib/transit/contracts";
import { arrivalEstimate, arrivalLabel } from "@/lib/transit/estimates";
export function useArrivalClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
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
  const now = useArrivalClock();
  return (
    <Typography variant="body2" color="text.secondary">
      {arrivalLabel(arrivalEstimate(arrival, now, connected))}
    </Typography>
  );
}
