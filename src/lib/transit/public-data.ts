"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  errors?: Partial<Record<"routes" | "stops" | "vehicles" | "health" | "alerts", string>>;
};

export async function loadPublicTransit(signal: AbortSignal, previous?: PublicTransitData | null, refresh = {catalog:true, alerts:true}): Promise<PublicTransitData> {
  signal = AbortSignal.any([signal, AbortSignal.timeout(10_000)]);
  const db = publicTransitClient();
  if (!db) throw new Error("Campus transit data is not configured.");
  const [routes, stops, vehicles, health, alerts] = await Promise.all([
    !refresh.catalog && previous ? Promise.resolve({data:previous.routes,error:previous.errors?.routes}) : db.from("transit_routes").select("*").eq("active", true).order("id").limit(1000).abortSignal(signal),
    !refresh.catalog && previous ? Promise.resolve({data:previous.stops,error:previous.errors?.stops}) : db.from("transit_stops").select("*").eq("active", true).order("id").limit(1000).abortSignal(signal),
    db.from("transit_vehicles").select("*").order("id").limit(1000).abortSignal(signal),
    db.from("feed_status").select("*").in("id", ["uga-passio:static", "uga-passio:vehicles", "uga-passio:arrivals", "uga-passio:alerts", "uga-campus:catalog"]).limit(1000).abortSignal(signal),
    !refresh.alerts && previous ? Promise.resolve({data:previous.alerts,error:previous.errors?.alerts}) : db.from("transit_alerts").select("*").eq("active", true).order("id").limit(1000).abortSignal(signal),
  ]);
  const errors: NonNullable<PublicTransitData["errors"]> = {};
  const results = { routes, stops, vehicles, health, alerts };
  for (const [name, result] of Object.entries(results)) {
    if (result.error || result.data?.length === 1000) {
      errors[name as keyof typeof errors] = result.data?.length === 1000
        ? "The catalog exceeds the supported display limit."
        : "This part of the transit snapshot is temporarily unavailable.";
    }
  }
  return {
    routes: errors.routes ? previous?.routes ?? [] : routes.data ?? [],
    stops: errors.stops ? previous?.stops ?? [] : stops.data ?? [],
    vehicles: errors.vehicles ? previous?.vehicles ?? [] : vehicles.data ?? [],
    health: errors.health ? previous?.health ?? [] : health.data ?? [],
    alerts: errors.alerts ? previous?.alerts ?? [] : alerts.data ?? [],
    errors,
  };
}

export function usePublicTransit() {
  const previousRef = useRef<PublicTransitData | null>(null);
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
    let previous = previousRef.current;
    let catalogReadAt = 0, alertsReadAt = 0;
    async function refresh(force = false) {
      if (document.hidden || disposed) return;
      controller?.abort();
      const request = new AbortController();
      controller = request;
      try {
        const parts = {catalog:force || Date.now()-catalogReadAt >= 300_000, alerts:force || Date.now()-alertsReadAt >= 120_000};
        const data = await loadPublicTransit(request.signal, previous, parts);
        if (!disposed && !request.signal.aborted) {
          if(parts.catalog) catalogReadAt=Date.now();
          if(parts.alerts) alertsReadAt=Date.now();
          previous = data;
          previousRef.current = data;
          const catalogFailed = data.errors?.routes || data.errors?.stops;
          setState({ status: catalogFailed ? "unavailable" : "ok", data, reason: catalogFailed ? "The campus transit catalog is temporarily unavailable. Last loaded information may be stale." : null });
        }
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
      else void refresh(true);
    }
    void refresh(true);
    // Browsers read the centrally imported snapshot; they never poll the provider.
    const interval = window.setInterval(() => void refresh(), 10_000);
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
