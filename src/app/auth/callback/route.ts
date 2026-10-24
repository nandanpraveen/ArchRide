import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server-client";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  //next verification
  const raw = searchParams.get("next");
  const next =
    raw &&
    raw.startsWith("/") &&
    !raw.startsWith("//") &&
    !raw.startsWith("/\\")
      ? raw
      : "/"; //redirecting to home on failed authentication brings user to sign-in

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // redirect user to specified redirect URL or root of app
      return NextResponse.redirect(new URL(next, origin));
    }
  }
  // redirect the user to an error page with some instructions
  return NextResponse.redirect(new URL("/auth/auth-code-error", origin)); //note: create a descriptive error page
}
