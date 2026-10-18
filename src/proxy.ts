import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  let response = NextResponse.next({ request });
  if (!url || !key) return response;
  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([name, value]) =>
          response.headers.set(name, value),
        );
      },
    },
  });
  const claims = await supabase.auth.getClaims();
  const isUserAuthenticated = claims.data?.claims;
  const path = request.nextUrl.pathname;
  const isPathAuthenticated =
    path.startsWith("/sign-in") || path.startsWith("/create-account");

  if (
    !(request.cookies.has("guest") || isUserAuthenticated) &&
    !isPathAuthenticated
  ) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
  return response;
}
export const config = {
  //AI generated guard against any of the listed file formats
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)", //proxy will run on every path except the listed
  ],
};
