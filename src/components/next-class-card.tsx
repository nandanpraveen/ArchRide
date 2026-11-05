"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import getNextOccurrence from "@/app/classes/next-class";
import { homePlanHref, type HomeOrigin } from "./home-journey";
import { useClasses } from "@/lib/use-classes";
import { useMissingBuildings } from "@/lib/use-missing-building";
export function NextClassCard({ origin }: { origin: HomeOrigin | null }) {
  const { classes, status, reload } = useClasses();
  const missing = useMissingBuildings(classes.map((c) => c.buildingId));
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const next = status === "ready" ? getNextOccurrence(classes, now) : null;
  const time = next
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
      }).format(Date.parse(next.startTime))
    : null;
  const href = next
    ? homePlanHref(origin, {
        id: next.classEntry.buildingId,
        name: next.classEntry.buildingName,
        type: "building",
        locationLabel: "Class building",
      }) +
      `&deadline=${encodeURIComponent(new Date(Date.parse(next.startTime) - next.classEntry.minutesEarly * 60000).toISOString())}`
    : "/classes";
  return (
    <Box component="section" aria-label="Next class">
      <Stack spacing={2}>
        <Stack
          direction="row"
          sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}
        >
          <Typography component="h2" variant="h2">
            Your next class
          </Typography>
        </Stack>
        {status === "loading" && (
          <Typography color="text.secondary" role="status">
            Loading your schedule…
          </Typography>
        )}
        {status === "error" && (
          <Alert
            severity="warning"
            action={
              <Button onClick={reload} color="inherit">
                Retry
              </Button>
            }
          >
            Your schedule could not load.
          </Alert>
        )}
        {status === "ready" && classes.length > 0 && !next && (
          <Typography color="text.secondary">No upcoming classes.</Typography>
        )}
        {next && (
          <>
            <Typography variant="h6" sx={{ overflowWrap: "anywhere" }}>
              {next.classEntry.title}
            </Typography>
            <Typography
              className="transit-number"
              sx={{ fontSize: "1.65rem", fontWeight: 700, lineHeight: 1.2 }}
            >
              {time}
            </Typography>
            <Typography color="text.secondary">
              {next.classEntry.buildingName}
            </Typography>
            {missing.has(next.classEntry.buildingId) ? (
              <Alert severity="warning">
                This building is unavailable. Choose a replacement in your
                schedule.
              </Alert>
            ) : (
              <Button
                component={Link}
                href={href}
                endIcon={<ArrowForwardRounded />}
                variant="contained"
              >
                Plan trip to class
              </Button>
            )}
          </>
        )}
        <Button
          component={Link}
          href="/classes"
          sx={{ alignSelf: "flex-start", px: 0 }}
        >
          {!classes.length ? "Add your classes" : "Edit class schedule"}
        </Button>
      </Stack>
    </Box>
  );
}
