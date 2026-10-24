import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

let client: SupabaseClient<Database> | null = null;

// Public catalog reads always use the publishable key, without an Auth session.
export function publicTransitClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  client ??= createClient<Database>(url, key, { accessToken: async () => null });
  return client;
}
