/** Identity is validated with Auth before this untrusted session identifier is used in a DB check. */
export function tokenSessionId(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    const value = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))).session_id;
    return typeof value === "string" && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value) ? value : null;
  } catch { return null; }
}
