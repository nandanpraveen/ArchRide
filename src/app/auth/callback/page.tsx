"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Stack, Typography } from "@mui/material";
import { authClient } from "@/lib/supabase/auth";
import { authDestination } from "@/lib/auth-redirect";
import { sitePath } from "@/lib/site";
import { useAuth } from "@/components/auth-provider";
let exchange: { code: string; promise: Promise<boolean> } | null = null;
export default function CallbackPage() {
  const router = useRouter(), { refresh } = useAuth(), [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search), code = params.get("code"), next = authDestination(params.get("next"));
    const client = authClient();
    if (!code || params.has("error") || !client) {
      queueMicrotask(() => { if (active) setError("Google sign-in was cancelled or the link expired. Try signing in again."); });
      return () => { active = false; };
    }
    if (exchange?.code !== code) exchange = { code, promise: client.auth.exchangeCodeForSession(code).then(result => !result.error && !!result.data.session).catch(() => false) };
    void exchange.promise.then(async okay => {
      if (!active) return;
      window.history.replaceState(null, "", sitePath("/auth/callback/"));
      if (okay && await refresh()) { if (active) router.replace(next); }
      else if (active) setError("Your sign-in could not be completed. Return to sign in and try again.");
    });
    return () => { active = false; };
  }, [refresh, router]);
  return <Stack spacing={2} sx={{ maxWidth: 440, mx: "auto", py: 5 }}><Typography component="h1" variant="h1">{error ? "Sign-in didn’t finish" : "Completing sign-in"}</Typography><Typography role={error ? "alert" : "status"} color="text.secondary">{error || "Checking your Google session…"}</Typography>{error && <Button component={Link} href="/sign-in" variant="contained">Return to sign in</Button>}</Stack>;
}
