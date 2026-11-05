import type { Route } from "./contracts";
import type { Json } from "@/lib/supabase/database.types";

export function mapCoordinates(longitude: number, latitude: number): boolean {
  return (
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    Math.abs(longitude) <= 180 &&
    Math.abs(latitude) <= 90
  );
}

export function routeColor(route?: Route): string {
  return route?.color && /^#?[0-9a-f]{6}$/i.test(route.color)
    ? `#${route.color.replace(/^#/, "")}`
    : "#8f2631";
}

export function mapPath(points: Json | undefined): [number, number][] {
  if (!Array.isArray(points) || points.length < 2) return [];
  // One malformed point invalidates the whole source line; never bridge missing geometry.
  if (
    !points.every(
      (p) =>
        Array.isArray(p) &&
        p.length >= 2 &&
        typeof p[0] === "number" &&
        typeof p[1] === "number" &&
        mapCoordinates(p[0], p[1]),
    )
  )
    return [];
  return points.map((p) => [(p as number[])[0], (p as number[])[1]]);
}

export const transitTime = (stamp: string) =>
  new Date(stamp).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
