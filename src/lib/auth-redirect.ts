// Adapted from Jadon's PR #4 integration; destinations stay inside the static app.
const destinations = new Set(["/", "/map", "/plan", "/saved", "/classes", "/profile", "/notifications"]);
export function authDestination(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return "/";
  try {
    const target = new URL(value, "https://archride.invalid");
    const path = target.pathname.replace(/\/$/, "") || "/";
    return target.origin === "https://archride.invalid" && destinations.has(path)
      ? path + target.search + target.hash : "/";
  } catch { return "/"; }
}
