import "server-only";
import { getAccount } from "@/app/get-user";
import { createClient } from "@/lib/supabase/server-client";

export type AdminCheck =
  | { ok: true; userId: string }
  | { ok: false; reason: "signed-out" | "forbidden" | "unavailable" };

export class AdminAccessError extends Error {
  constructor(public reason: "signed-out" | "forbidden" | "unavailable") {
    super(`Admin access denied: ${reason}`);
  }
}

// Identity comes from supabase.auth.getUser(), which validates the token with Supabase
// (not just the cookie). The role comes from the admin_users table through is_admin(),
// never from user_metadata or anything the client sends.
export async function checkAdmin(): Promise<AdminCheck> {
  const account = await getAccount();
  if (account.unavailable) return { ok: false, reason: "unavailable" };
  if (!account.user) return { ok: false, reason: "signed-out" };

  try {
    const supabase = await createClient();
    // Remove this cast after the migration is applied and `pnpm db:types` regenerates the types.
    const { data, error } = await (
      supabase as unknown as {
        rpc: (fn: string) => Promise<{ data: unknown; error: unknown }>;
      }
    ).rpc("is_admin");
    if (error) return { ok: false, reason: "unavailable" };
    return data === true
      ? { ok: true, userId: account.user.id }
      : { ok: false, reason: "forbidden" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

// Call this first in EVERY admin server action and route handler, not just the page.
export async function assertAdmin(): Promise<string> {
  const check = await checkAdmin();
  if (!check.ok) throw new AdminAccessError(check.reason);
  return check.userId;
}
