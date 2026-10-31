"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, Box, Button, Typography } from "@mui/material";
import { DateTime } from "ts-luxon";
import getNextOccurrence from "@/app/classes/next-class";
import { homePlanHref, type HomeOrigin } from "@/components/home-journey";
import { useClasses } from "@/lib/use-classes";
import { useMissingBuildings } from "@/lib/use-missing-building";

export function NextClassCard({ origin }: { origin: HomeOrigin | null }) {
  const { classes, status, source, reload } = useClasses();
  const missing = useMissingBuildings(classes.map((item) => item.buildingId));
  const [now, setNow] = useState(() => DateTime.now());

  // Keep "next class" current while Home stays open.
  useEffect(() => {
    const timer = setInterval(() => setNow(DateTime.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const next = status === "ready" ? getNextOccurrence(classes, now) : null;
  const start = next ? DateTime.fromISO(next.startTime, { zone: "America/New_York" }) : null;
  const buildingGone = !!next && missing.has(next.classEntry.buildingId);

  return (
    <Box component="section" aria-label="Next class">
      <Typography component="h2" variant="h2" sx={{ mb: 1 }}>
        Your next class
      </Typography>
      {status === "loading" && <Typography color="text.secondary">Loading your schedule…</Typography>}
      {status === "error" && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={reload}>
              Try again
            </Button>
          }
        >
          Your class schedule could not be loaded.
        </Alert>
      )}
      {status === "ready" && !classes.length && (
        <Typography color="text.secondary">Add your weekly classes to see the next one here.</Typography>
      )}
      {status === "ready" && classes.length > 0 && !next && (
        <Typography color="text.secondary">All of your classes are turned off.</Typography>
      )}
      {next && start && (
        <>
          <Typography sx={{ fontWeight: 500, overflowWrap: "anywhere" }}>{next.classEntry.title}</Typography>
          <Typography>
            {start.toFormat("cccc, LLL d 'at' h:mm a")} campus time
            {next.classEntry.minutesEarly > 0 && ` · arrive ${next.classEntry.minutesEarly} min early`}
          </Typography>
          <Typography color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
            {next.classEntry.buildingName || "Building not set"}
          </Typography>
          {buildingGone ? (
            <>
              <Alert severity="warning" sx={{ mt: 1 }}>
                This building is no longer in campus data, so a trip there cannot be planned.
              </Alert>
              <Button component={Link} href="/classes" variant="contained" sx={{ mt: 2, mr: 1 }}>
                Choose a new building
              </Button>
            </>
          ) : (
            <Button
              component={Link}
              href={homePlanHref(origin, {
                id: next.classEntry.buildingId,
                name: next.classEntry.buildingName,
                type: "building",
                locationLabel: "Class building",
              })}
              variant="contained"
              sx={{ mt: 2, mr: 1 }}
            >
              Plan trip to class
            </Button>
          )}
        </>
      )}
      <Button component={Link} href="/classes" sx={{ mt: 2 }}>
        {status === "ready" && !classes.length ? "Add your classes" : "Edit class schedule"}
      </Button>
      {status === "ready" && source === "device" && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Guest schedules stay on this device. Sign in to sync your classes.
        </Typography>
      )}
    </Box>
  );
}
