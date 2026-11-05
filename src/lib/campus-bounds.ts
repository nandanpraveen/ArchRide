import boundary from "./campus-boundary.json";

export const CAMPUS_CENTER: [number, number] = [-83.3754, 33.9519];
export const CAMPUS_BUFFER_METERS = boundary.bufferMeters;
export const CAMPUS_MAX_BOUNDS: [[number, number], [number, number]] = [[boundary.bounds[0], boundary.bounds[1]], [boundary.bounds[2], boundary.bounds[3]]];
const ring = boundary.ring;
const longitudeMeters = 111320 * Math.cos(33.945 * Math.PI / 180), latitudeMeters = 111320;
export function insideCampusBounds(longitude: number, latitude: number) {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x, y] = ring[i], [px, py] = ring[j];
    const cross = (longitude - x) * (py - y) - (latitude - y) * (px - x);
    if (Math.abs(cross) < 1e-14 && longitude >= Math.min(x, px) - 1e-10 && longitude <= Math.max(x, px) + 1e-10 && latitude >= Math.min(y, py) - 1e-10 && latitude <= Math.max(y, py) + 1e-10) return true;
    if ((y > latitude) !== (py > latitude) && longitude < (px - x) * (latitude - y) / (py - y) + x) inside = !inside;
  }
  return inside;
}
function clearance(longitude: number, latitude: number) {
  if (!insideCampusBounds(longitude, latitude)) return 0;
  let nearest = Infinity;
  for (let i = 1; i < ring.length; i++) {
    const ax = (ring[i-1][0] - longitude) * longitudeMeters, ay = (ring[i-1][1] - latitude) * latitudeMeters;
    const bx = (ring[i][0] - longitude) * longitudeMeters, by = (ring[i][1] - latitude) * latitudeMeters;
    const dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length)) : 0;
    nearest = Math.min(nearest, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return nearest;
}
const centerClearance = clearance(...CAMPUS_CENTER);
/** Keep the entire viewport in the geographic boundary, including rectangular corners.
 * The 25 m reserve covers the local distance approximation; bearing/pitch stay zero. */
export function constrainCampusCamera(longitude: number, latitude: number, zoom: number, width = 800, height = 600) {
  const diagonal = Math.hypot(Math.max(1, width), Math.max(1, height)) / 2;
  const groundScale = 156543.03392 * Math.cos(33.945 * Math.PI / 180);
  const minZoom = Math.max(12, Math.log2(groundScale * diagonal / (centerClearance - 50)));
  const nextZoom = Math.max(minZoom, Math.min(20, Number.isFinite(zoom) ? zoom : 14));
  const radius = diagonal * groundScale / 2 ** nextZoom + 25;
  let target: [number, number] = [longitude, latitude];
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) target = [...CAMPUS_CENTER];
  if (clearance(...target) < radius) {
    let low = 0, high = 1;
    for (let i = 0; i < 28; i++) {
      const t = (low + high) / 2;
      const point: [number, number] = [CAMPUS_CENTER[0] + (target[0] - CAMPUS_CENTER[0]) * t, CAMPUS_CENTER[1] + (target[1] - CAMPUS_CENTER[1]) * t];
      if (clearance(...point) >= radius) low = t; else high = t;
    }
    target = [CAMPUS_CENTER[0] + (target[0] - CAMPUS_CENTER[0]) * low, CAMPUS_CENTER[1] + (target[1] - CAMPUS_CENTER[1]) * low];
  }
  return { center: target, zoom: nextZoom };
}
