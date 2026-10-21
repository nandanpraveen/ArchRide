"use client";

import { useCallback, useEffect, useState } from "react";
import type { Tables } from "@/lib/supabase/database.types";
import { publicTransitClient } from "@/lib/supabase/public";
import type { FeedHealth, Route, Stop, Vehicle } from "./contracts";
export { activeTransitAlerts } from "./contracts";
export { publicTransitClient } from "@/lib/supabase/public";

export type PublicTransitData = {
  routes: Route[];
  stops: Stop[];
  vehicles: Vehicle[];
  health: FeedHealth[];
  alerts: Tables<"transit_alerts">[];
};

export async function loadPublicTransit(signal: AbortSignal): Promise<PublicTransitData> {
  signal = AbortSignal.any([signal, AbortSignal.timeout(10_000)]);
  const db = publicTransitClient();
  if (!db) throw new Error("Campus transit data is not configured.");
  const [routes, stops, vehicles, health, alerts] = await Promise.all([
    db.from("transit_routes").select("*").eq("active", true).order("id").limit(1000).abortSignal(signal),
    db.from("transit_stops").select("*").eq("active", true).order("id").limit(1000).abortSignal(signal),
    db.from("transit_vehicles").select("*").order("id").limit(1000).abortSignal(signal),
    db.from("feed_status").select("*").like("id", "uga-passio:%").limit(1000).abortSignal(signal),
    db.from("transit_alerts").select("*").eq("active", true).order("id").limit(1000).abortSignal(signal),
  ]);
  if ([routes, stops, vehicles, health, alerts].some((result) => result.error)) {
    throw new Error("Campus transit data is temporarily unavailable. Please try again.");
  }
  if ([routes, stops, vehicles, health, alerts].some((result) => result.data?.length === 1000)) {
    throw new Error("The transit catalog exceeds the supported display limit.");
  }
  return {
    routes: routes.data ?? [],
    stops: stops.data ?? [],
    vehicles: vehicles.data ?? [],
    health: health.data ?? [],
    alerts: alerts.data ?? [],
  };
}

export function usePublicTransit() {
  const [state, setState] = useState<{
    status: "loading" | "ok" | "unavailable";
    data: PublicTransitData | null;
    reason: string | null;
  }>({ status: "loading", data: null, reason: null });
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    let controller: AbortController | null = null;
    let disposed = false;
    async function refresh() {
      if (document.hidden || disposed) return;
      controller?.abort();
      const request = new AbortController();
      controller = request;
      try {
        const data = await loadPublicTransit(request.signal);
        if (!disposed && !request.signal.aborted) setState({ status: "ok", data, reason: null });
      } catch (error) {
        if (!disposed && !request.signal.aborted) {
          setState((previous) => ({
            status: "unavailable",
            data: previous.data,
            reason: error instanceof Error ? error.message : "Campus transit data is unavailable.",
          }));
        }
      }
    }
    function visibilityChanged() {
      if (document.hidden) controller?.abort();
      else void refresh();
    }
    void refresh();
    // Browsers read the centrally imported snapshot; they never poll the provider.
    const interval = window.setInterval(() => void refresh(), 60_000);
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      disposed = true;
      controller?.abort();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [revision]);

  return { ...state, retry };
}
