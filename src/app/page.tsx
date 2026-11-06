"use client";
import Link from "next/link";
import { useState } from "react";
import { Box, Button, Stack, Typography, useMediaQuery } from "@mui/material";
import { JourneyForm } from "@/components/journey-form";
import { CampusOverview } from "@/components/campus-overview";
import { HomeDepartures } from "@/components/home-departures";
import { HomeStatus, HomeAlerts } from "@/components/home-status";
import { HomeFavorites } from "@/components/home-favorites";
import { NextClassCard } from "@/components/next-class-card";
import { usePersonal } from "@/components/personal-provider";
import { type HomeOrigin } from "@/components/home-journey";
import { usePublicTransit } from "@/lib/transit/public-data";
import { planRefHref } from "@/lib/personal";
import { ManualNotices } from "@/components/manual-notices";
export default function HomePage() {
  const transit = usePublicTransit(),
    personal = usePersonal();
  const [origin, setOrigin] = useState<HomeOrigin | null>(null);
  const desktop = useMediaQuery("(min-width: 900px)");
  return (
    <Stack spacing={3}>
      <Box>
        <Typography component="h1" variant="h1">
          Where are you headed?
        </Typography>
      </Box>
      <HomeAlerts transit={transit} />
      <ManualNotices />
      {personal.active && (
        <Box sx={{ py: 2, borderBottom: 1, borderColor: "divider" }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            sx={{
              alignItems: { sm: "center" },
              justifyContent: "space-between",
            }}
          >
            <Box>
              <Typography sx={{ fontWeight: 700 }}>Trip in progress</Typography>
              <Typography variant="body2" color="text.secondary">
                {personal.active.destination.name}
              </Typography>
            </Box>
            <Button
              component={Link}
              href={
                planRefHref(
                  personal.active.origin,
                  personal.active.destination,
                ) + "&resume=1"
              }
              variant="contained"
            >
              Resume trip
            </Button>
          </Stack>
        </Box>
      )}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "minmax(0,1fr)",
            md: "minmax(300px,360px) minmax(0,1fr)",
            lg: "minmax(300px,360px) minmax(0,1fr) minmax(240px,280px)",
          },
          gap: 3,
          alignItems: "start",
        }}
      >
        <Stack spacing={3} sx={{ minWidth: 0 }}>
          <JourneyForm
            initialFrom={personal.prefs.defaultOrigin}
            onOrigin={setOrigin}
          />
          {origin && (
            <Box sx={{ borderTop: 1, borderColor: "divider", pt: 3 }}>
              <HomeDepartures origin={origin} transit={transit} />
            </Box>
          )}
        </Stack>
        {desktop && (
          <Box
            component="section"
            aria-label="Campus overview"
            sx={{
              minWidth: 0,
              height: "max(520px, calc(100dvh - 280px))",
              position: "sticky",
              top: 24,
            }}
          >
            <CampusOverview data={transit.data} unavailable={transit.status === "unavailable"} />
          </Box>
        )}
        <Box
          component="aside"
          aria-label="Your campus day"
          sx={{
            minWidth: 0,
            display: "grid",
            gridColumn: { md: "1 / -1", lg: "auto" },
            gridTemplateColumns: { xs: "minmax(0,1fr)", sm: "repeat(2,minmax(0,1fr))", lg: "minmax(0,1fr)" },
            gap: 3,
            borderTop: { xs: "1px solid var(--mui-palette-divider)", lg: 0 },
            borderLeft: { lg: "1px solid var(--mui-palette-divider)" },
            pt: { xs: 3, lg: 0 },
            pl: { lg: 3 },
          }}
        >
          <NextClassCard origin={origin} />
          <HomeFavorites />
        </Box>
      </Box>
      <Box
        component="details"
        sx={{ borderTop: 1, borderColor: "divider", pt: 2 }}
      >
        <Box
          component="summary"
          sx={{ cursor: "pointer", py: 1.5, fontWeight: 600, minHeight: 48 }}
        >
          Transit updates & data sources
        </Box>
        <Box sx={{ pt: 2 }}>
          <HomeStatus transit={transit} />
        </Box>
      </Box>
    </Stack>
  );
}
