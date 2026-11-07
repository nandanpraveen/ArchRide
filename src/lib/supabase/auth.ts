import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
let client: SupabaseClient<Database> | null = null;
export function authClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  client ??= createClient<Database>(url, key, {
    auth: { flowType: "pkce", detectSessionInUrl: false, persistSession: true, autoRefreshToken: true, storageKey: "archride.auth" },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) }) },
  });
  return client;
}

export function sessionExpired() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("archride:session-expired"));
}
