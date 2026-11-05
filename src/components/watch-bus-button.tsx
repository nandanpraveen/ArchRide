"use client";
import { Button } from "@mui/material";
import NotificationsActiveRounded from "@mui/icons-material/NotificationsActiveRounded";
import NotificationsOffRounded from "@mui/icons-material/NotificationsOffRounded";
import type { WatchedBus } from "@/lib/leave-now";
import { isWatched } from "@/lib/watched-buses";
import { useNotificationCenter } from "./notifications-provider";

/** Starts or stops leave-now reminders for one bus at one stop. */
export function WatchBusButton(bus: WatchedBus) {
  const { watched, watchBus, unwatchBus } = useNotificationCenter();
  const watching = isWatched(watched, bus);
  return (
    <Button
      size="small"
      variant={watching ? "contained" : "outlined"}
      startIcon={
        watching ? <NotificationsOffRounded /> : <NotificationsActiveRounded />
      }
      aria-pressed={watching}
      aria-label={`${watching ? "Stop watching" : "Watch"} ${bus.routeName} at ${bus.stopName}`}
      onClick={() => (watching ? unwatchBus(bus) : watchBus(bus))}
      sx={{ alignSelf: "flex-start" }}
    >
      {watching ? "Stop watching" : "Watch this bus"}
    </Button>
  );
}
