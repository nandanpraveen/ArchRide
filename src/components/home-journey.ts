import type { Place } from "@/lib/campus-data";
import type { Stop } from "@/lib/transit/contracts";
import { mapCoordinates } from "@/lib/transit/map-data";

export type HomeOrigin =
  | { kind: "place"; place: Place }
  | { kind: "gps"; latitude: number; longitude: number };

export function nearestHomeStops(stops: Stop[], origin: HomeOrigin | null) {
  const point = origin?.kind === "gps" ? origin : origin?.place;
  if (!point || !mapCoordinates(point.longitude!, point.latitude!)) return [];
  const latitude = point.latitude!;
  const longitude = point.longitude!;
  const radians = Math.PI / 180;
  return stops.filter((stop) => stop.active && stop.location_type === 0 && mapCoordinates(stop.longitude, stop.latitude))
    .map((stop) => {
      const a = Math.sin((stop.latitude - latitude) * radians / 2) ** 2
        + Math.cos(latitude * radians) * Math.cos(stop.latitude * radians)
        * Math.sin((stop.longitude - longitude) * radians / 2) ** 2;
      return { stop, meters: 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a)))) };
    })
    .sort((a, b) => a.meters - b.meters || a.stop.id.localeCompare(b.stop.id))
    .slice(0, 3);
}

export function homePlanHref(origin: HomeOrigin | null, destination: Place | null) {
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

export function homePlaceHref(place: Place) {
  return place.type === "stop" ? `/map?stop=${encodeURIComponent(place.id)}`
    : `/map?place=${encodeURIComponent(place.id)}&type=${place.type}`;
}
