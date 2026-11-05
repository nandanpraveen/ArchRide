// Transient handoff between Home and Plan. Never written to a URL or persistent storage.
let point: { latitude: number; longitude: number; at: number } | null = null;
export function rememberLocation(latitude: number, longitude: number) {
  point = { latitude, longitude, at: Date.now() };
}
export function currentLocation() {
  return point && Date.now() - point.at < 5 * 60_000 ? point : null;
}
