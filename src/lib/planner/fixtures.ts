import type { Place, Stop } from "./planner";

// PLACEHOLDER DATA: coordinates are approximate. Replace with Supabase tables
// (buildings, stops) once the transit ingestion work lands.
export const BUILDINGS: Place[] = [
  { id: "main-library", name: "Main Library", lat: 33.9566, lng: -83.3745 },
  { id: "tate-center", name: "Tate Student Center", lat: 33.9528, lng: -83.3757 },
  { id: "sanford-stadium", name: "Sanford Stadium", lat: 33.9496, lng: -83.3733 },
  { id: "ramsey-center", name: "Ramsey Student Center", lat: 33.9388, lng: -83.373 },
  { id: "miller-learning", name: "Miller Learning Center", lat: 33.9558, lng: -83.3763 },
];

export const STOPS: Stop[] = [
  { id: "orbit-library", routeName: "Orbit", name: "Library stop", lat: 33.9562, lng: -83.3741 },
  { id: "orbit-tate", routeName: "Orbit", name: "Tate stop", lat: 33.953, lng: -83.3752 },
  { id: "orbit-stadium", routeName: "Orbit", name: "Stadium stop", lat: 33.95, lng: -83.3728 },
  { id: "orbit-ramsey", routeName: "Orbit", name: "Ramsey stop", lat: 33.9392, lng: -83.3735 },
  { id: "east-tate", routeName: "East Campus Express", name: "Tate east stop", lat: 33.9526, lng: -83.3748 },
  { id: "east-ramsey", routeName: "East Campus Express", name: "Ramsey east stop", lat: 33.9385, lng: -83.3725 },
];
