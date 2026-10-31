"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Accordion, AccordionSummary, AccordionDetails, Alert, Button, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import { TripComparisonPreview } from "@/components/trip-comparison-preview";
import { DeadlineSearch } from "@/components/deadline-search";
import { EmptyState } from "@/components/empty-state";
import { publicTransitClient } from "@/lib/transit/public-data";

type Selection = { label: string; name: string; href: string };
function PlanContent() {
  const params = useSearchParams();
  const query = params.toString();
  const [result, setResult] = useState<{ query: string; selections: Selection[]; error: boolean } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]);
    async function load() {
      const search = new URLSearchParams(query);
      const db = publicTransitClient();
      let error = false;
      const selections: Selection[] = [];
      for (const [key, label] of [["from", "Starting point"], ["to", "Destination"]]) {
        const id = search.get(key);
        if (!id) continue;
        const type = search.get(`${key}Type`) ?? "stop";
        if (!db || !["stop", "building", "entrance"].includes(type)) {
          error = true;
          continue;
        }
        try {
          const table = type === "building" ? "transit_buildings" : type === "entrance" ? "transit_entrances" : "transit_stops";
          const response = await db.from(table).select("id,name").eq("id", id).abortSignal(signal).maybeSingle();
          if (response.error || !response.data) error = true;
          else selections.push({
            label, name: response.data.name,
            href: type === "stop" ? `/map?stop=${encodeURIComponent(id)}` : `/map?place=${encodeURIComponent(id)}&type=${type}`,
          });
        } catch { error = true; }
      }
      if (!controller.signal.aborted) setResult({ query, selections, error });
    }
    void load();
    return () => controller.abort();
  }, [query]);
  const current = result?.query === query ? result : null;
  return (
    <Stack spacing={3}>
      <Typography component="h1" variant="h1">Plan a trip</Typography>
      {params.get("fromSource") === "current-location" && <Alert severity="info">Starting point: current location selected on Home. Its coordinates were kept only on Home; share your location again when trip planning is connected.</Alert>}
      {!current && <CircularProgress aria-label="Loading selected places" />}
      {current?.selections.map((place) => (
        <Paper key={place.label} variant="outlined" sx={{ p: 3 }}>
          <Typography component="h2" variant="h3">{place.label}: {place.name}</Typography>
          <Button component={Link} href={place.href}>View place details</Button>
        </Paper>
      ))}
      {current?.error && <Alert severity="warning">A selected place is unavailable. Choose a verified building or stop from Home or Map.</Alert>}
      <DeadlineSearch />
      <Accordion>
        <AccordionSummary><Typography component="h2" variant="h3">Preview comparison with sample data</Typography></AccordionSummary>
        <AccordionDetails><TripComparisonPreview /></AccordionDetails>
      </Accordion>
      <EmptyState
        title="Trip recommendations are not available yet"
        description="Planning needs verified walking paths and usable transit arrivals. Your selected places are shown above; no journey times or bus recommendations are being estimated."
        action="Explore the map"
        href="/map"
      />
    </Stack>
  );
}
export default function PlanPage() {
  return <Suspense fallback={<CircularProgress aria-label="Loading trip planner" />}><PlanContent /></Suspense>;
}
