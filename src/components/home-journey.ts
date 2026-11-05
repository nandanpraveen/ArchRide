import type { Place } from "@/lib/campus-data";
import type { Stop } from "@/lib/transit/contracts";
import { haversineMeters } from "@/lib/planner/planner";
import { mapCoordinates } from "@/lib/transit/map-data";

export type HomeOrigin =
  | { kind: "place"; place: Place }
  | { kind: "gps"; latitude: number; longitude: number };

export function nearestHomeStops(stops: Stop[], origin: HomeOrigin | null) {
  const point = origin?.kind === "gps" ? origin : origin?.place;
  if (!point || !mapCoordinates(point.longitude!, point.latitude!)) return [];
  const latitude = point.latitude!;
  const longitude = point.longitude!;
  return stops
    .filter(
      (stop) =>
        stop.active &&
        stop.location_type === 0 &&
        mapCoordinates(stop.longitude, stop.latitude),
    )
    .map((stop) => ({
      stop,
      meters: haversineMeters({ latitude, longitude }, stop),
    }))
    .sort((a, b) => a.meters - b.meters || a.stop.id.localeCompare(b.stop.id))
    .slice(0, 3);
}

export function homePlanHref(
  origin: HomeOrigin | null,
  destination: Place | null,
) {
  const params = new URLSearchParams();
  if (origin?.kind === "place") {
    params.set("from", origin.place.id);
    params.set("fromType", origin.place.type);
  } else if (origin?.kind === "gps") {
    // Coordinates remain in Home's memory; only the selection label travels to Plan.
    params.set("fromSource", "current-location");
  }
  if (destination) {
    params.set("to", destination.id);
    params.set("toType", destination.type);
  }
  return `/plan${params.size ? `?${params}` : ""}`;
}
