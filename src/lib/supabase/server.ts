import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "./env";
export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = getSupabaseEnv();
  return createServerClient<Database>(url, key, {
    global: {
      fetch: (input, init) => fetch(input, {
        ...init,
        signal: init?.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(10_000)])
          : AbortSignal.timeout(10_000),
        cache: "no-store",
      }),
    },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          /* Server Components cannot write cookies; src/proxy.ts refreshes sessions. */
        }
      },
    },
  });
}
