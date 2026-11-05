export function trustedAdmin(user: { id?: string; is_anonymous?: boolean; app_metadata?: Record<string, unknown> } | null) {
  return !!user?.id && !user.is_anonymous && user.app_metadata?.admin === true;
}
export function officialSource(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 500) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && (url.hostname === "uga.edu" || url.hostname.endsWith(".uga.edu"));
  } catch { return false; }
}
export function validNotice(body: Record<string, unknown>) {
  const from = Date.parse(String(body.validFrom)), until = Date.parse(String(body.validUntil));
  return typeof body.title === "string" && body.title.trim().length > 0 && body.title.length <= 100 && typeof body.body === "string" && body.body.trim().length > 0 && body.body.length <= 1000 && officialSource(body.sourceUrl) && Number.isFinite(from) && until > from && until - from <= 30 * 86400_000 && Array.isArray(body.routeIds) && body.routeIds.length <= 25 && body.routeIds.every(id => typeof id === "string" && id.length <= 200) && Array.isArray(body.stopIds) && body.stopIds.length <= 50 && body.stopIds.every(id => typeof id === "string" && id.length <= 200);
}
export function validCorrection(body: Record<string, unknown>) {
  return ["building", "entrance"].includes(String(body.kind)) && typeof body.placeId === "string" && body.placeId.length > 0 && body.placeId.length <= 200 && typeof body.name === "string" && body.name.trim().length > 0 && body.name.length <= 200 && typeof body.latitude === "number" && Number.isFinite(body.latitude) && body.latitude >= 33.88 && body.latitude <= 34.02 && typeof body.longitude === "number" && Number.isFinite(body.longitude) && body.longitude >= -83.46 && body.longitude <= -83.29 && officialSource(body.sourceUrl);
}
