// "use client";
// import { createBrowserClient } from "@supabase/ssr";
// import type { Database } from "./database.types";
// import { getSupabaseEnv } from "./env";
// export function createClient() {
//   const { url, key } = getSupabaseEnv();
//   return createBrowserClient<Database>(url, key);
// }
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  // Create a supabase client on the browser with project's credentials
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
