export function authDestination(value: string | null, origin: string): URL {
  const fallback = new URL("/profile", origin);
  if (!value?.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    const target = new URL(value, origin);
    return target.origin === origin && !target.pathname.startsWith("//") ? target : fallback;
  } catch {
    return fallback;
  }
}
