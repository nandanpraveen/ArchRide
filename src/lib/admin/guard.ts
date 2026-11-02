import "server-only";
import { getAccount } from "@/app/get-user";
import { createClient } from "@/lib/supabase/server-client";
import { evaluateAdmin, type AdminCheck } from "./decision";

export type { AdminCheck } from "./decision";

export class AdminAccessError extends Error {
  constructor(public reason: "signed-out" | "forbidden" | "unavailable") {
    super(`Admin access denied: ${reason}`);
  }
}

// Identity comes from supabase.auth.getUser() (validated with Supabase, not just the cookie).
// The role comes from the admin_users table through is_admin(), never from user_metadata.
export async function checkAdmin(): Promise<AdminCheck> {
  return evaluateAdmin({
    getAccount,
    isAdmin: async () => {
      const supabase = await createClient();
      // Remove this cast after the migration is applied and `pnpm db:types` regenerates the types.
      return (
        supabase as unknown as {
          rpc: (fn: string) => Promise<{ data: unknown; error: unknown }>;
        }
      ).rpc("is_admin");
    },
  });
}

// Call this first in EVERY admin server action and route handler, not just the page.
export async function assertAdmin(): Promise<string> {
  const check = await checkAdmin();
  if (!check.ok) throw new AdminAccessError(check.reason);
  return check.userId;
}
