export type LatLng = { lat: number; lng: number };
export type Place = LatLng & { id: string; name: string };
export type Stop = Place & { routeName: string };

// Assumptions. Replace with real data once schedules and live arrivals exist.
const EARTH_RADIUS_M = 6_371_000;
const WALK_SPEED_MPS = 1.34; // ~3 mph
const PATH_FACTOR = 1.3; // real paths are longer than straight lines
const BUS_SPEED_MPS = 5.5; // ~12 mph average including stops
const BUS_DWELL_MIN = 1;
const BUS_HEADWAY_MIN = 15; // assumed time between buses
const SIMILAR_THRESHOLD_MIN = 2;

export type WalkPlan = { mode: "walk"; minutes: number; meters: number };

export type BusPlan = {
  mode: "bus";
  minutes: number;
  routeName: string;
  boardStop: Stop;
  alightStop: Stop;
  walkToStopMin: number;
  waitMin: number;
  rideMin: number;
  walkFromStopMin: number;
};

export type Recommendation = "walk" | "bus" | "similar";

export type TripComparison = {
  walk: WalkPlan;
  bus: BusPlan | null;
  recommendation: Recommendation;
  differenceMin: number;
};

export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

function walkMinutesFor(a: LatLng, b: LatLng): number {
  return (haversineMeters(a, b) * PATH_FACTOR) / WALK_SPEED_MPS / 60;
}

export function nearestStop(point: LatLng, stops: Stop[]): Stop | null {
  let best: Stop | null = null;
  let bestDistance = Infinity;
  for (const stop of stops) {
    const distance = haversineMeters(point, stop);
    if (distance < bestDistance) {
      best = stop;
      bestDistance = distance;
    }
  }
  return best;
}

export function planWalk(from: LatLng, to: LatLng): WalkPlan {
  const meters = Math.round(haversineMeters(from, to) * PATH_FACTOR);
  return { mode: "walk", minutes: Math.max(1, Math.ceil(walkMinutesFor(from, to))), meters };
}

export function planBus(from: LatLng, to: LatLng, stops: Stop[]): BusPlan | null {
  const routeNames = Array.from(new Set(stops.map((s) => s.routeName)));
  let best: BusPlan | null = null;

  for (const routeName of routeNames) {
    const routeStops = stops.filter((s) => s.routeName === routeName);
    const boardStop = nearestStop(from, routeStops);
    const alightStop = nearestStop(to, routeStops);
    if (!boardStop || !alightStop || boardStop.id === alightStop.id) continue;

    const walkToStopMin = walkMinutesFor(from, boardStop);
    const waitMin = BUS_HEADWAY_MIN / 2; // average wait with no live data
    const rideMin =
      (haversineMeters(boardStop, alightStop) * PATH_FACTOR) / BUS_SPEED_MPS / 60 +
      BUS_DWELL_MIN;
    const walkFromStopMin = walkMinutesFor(alightStop, to);

    const plan: BusPlan = {
      mode: "bus",
      minutes: Math.ceil(walkToStopMin + waitMin + rideMin + walkFromStopMin),
      routeName,
      boardStop,
      alightStop,
      walkToStopMin,
      waitMin,
      rideMin,
      walkFromStopMin,
    };
    if (!best || plan.minutes < best.minutes) best = plan;
  }

  return best;
}

export function compareTrip(from: Place, to: Place, stops: Stop[]): TripComparison {
  const walk = planWalk(from, to);
  const bus = planBus(from, to, stops);

  if (!bus) {
    return { walk, bus, recommendation: "walk", differenceMin: 0 };
  }

  const differenceMin = Math.abs(walk.minutes - bus.minutes);
  let recommendation: Recommendation = "similar";
  if (differenceMin > SIMILAR_THRESHOLD_MIN) {
    recommendation = walk.minutes < bus.minutes ? "walk" : "bus";
  }
  return { walk, bus, recommendation, differenceMin };
}
