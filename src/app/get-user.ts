import "server-only";
import { createClient } from "@/lib/supabase/server-client";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function getAccount(): Promise<{
  user: User | null;
  unavailable: boolean;
}> {
  // Keep Next's request-time rendering signal outside the Auth outage handler.
  await cookies();
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    const missingSession =
      error?.name === "AuthSessionMissingError" ||
      error?.status === 401 ||
      error?.status === 403;
    return {
      user: error ? null : data.user,
      unavailable: !!error && !missingSession,
    };
  } catch {
    return { user: null, unavailable: true };
  }
}

export async function getUser(): Promise<User | null> {
  return (await getAccount()).user;
}
