import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server-client";
import { authDestination } from "@/lib/auth-redirect";

function redirectWithinApp(target: URL) {
  // A relative Location preserves the browser's actual host behind development/proxy URL rewriting.
  return new NextResponse(null, {
    status: 303,
    headers: { Location: target.pathname + target.search + target.hash, "Cache-Control": "private, no-store" },
  });
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return redirectWithinApp(authDestination(searchParams.get("next"), origin));
      }
    } catch {
      // Expired links, missing verifier cookies and service failures share a safe recovery page.
    }
  }
  return redirectWithinApp(new URL("/auth/auth-code-error", origin));
}
