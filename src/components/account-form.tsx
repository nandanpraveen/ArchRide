"use client";
// Email form behavior is adapted from Jadon's PR #4 contribution and its integration.
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Box, Button, Divider, Stack, SvgIcon, TextField, Typography } from "@mui/material";
import { authClient } from "@/lib/supabase/auth";
import { authDestination } from "@/lib/auth-redirect";
import { sitePath } from "@/lib/site";
import { useAuth } from "./auth-provider";

export function AccountForm({ mode }: { mode: "sign-in" | "create-account" }) {
  const router = useRouter(), search = useSearchParams(), auth = useAuth();
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [confirm, setConfirm] = useState("");
  const [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const submitting = useRef(false), creating = mode === "create-account";
  const next = authDestination(search.get("next"));
  useEffect(() => { if (auth.status === "signed-in") router.replace(next); }, [auth.status, next, router]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !event.currentTarget.checkValidity()) return;
    if (creating && password !== confirm) { setNotice("Passwords do not match. Check both entries."); return; }
    const client = authClient();
    if (!client) { setNotice("Sign-in is unavailable. Please try again later."); return; }
    submitting.current = true; setBusy(true); setNotice("");
    try {
      const credentials = { email: email.trim().toLowerCase(), password };
      const { data, error } = creating ? await client.auth.signUp(credentials) : await client.auth.signInWithPassword(credentials);
      if (error || !data.session) {
        setNotice(error?.status === 429 ? "Too many attempts. Wait a few minutes and try again."
          : creating ? "Unable to create your account. Try signing in if you already have one."
            : "Unable to sign in. Check your email and password, then try again.");
      } else if (await auth.refresh()) router.replace(next);
      else setNotice("Your session could not be checked. Check your connection and try again.");
    } catch { setNotice("Sign-in could not be reached. Check your connection and try again."); }
    finally { submitting.current = false; setBusy(false); }
  }
  async function google() {
    if (submitting.current) return;
    const client = authClient();
    if (!client) { setNotice("Sign-in is unavailable. Please try again later."); return; }
    submitting.current = true; setBusy(true); setNotice("");
    try {
      const redirectTo = new URL(sitePath("/auth/callback/"), window.location.origin);
      redirectTo.searchParams.set("next", next);
      const { error } = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo.href, queryParams: { prompt: "select_account" } } });
      if (error) throw error;
    } catch {
      setNotice("Google sign-in could not start. Try again or use your email.");
      submitting.current = false; setBusy(false);
    }
  }
  return <Stack spacing={3} sx={{ width: "100%", maxWidth: 440, mx: "auto", py: { xs: 3, sm: 6 } }}>
    <Box>
      <Typography component="h1" variant="h1">{creating ? "Create your account" : "Sign in to ArchRide"}</Typography>
      <Typography color="text.secondary" sx={{ mt: 1.5 }}>Sign in to plan your campus trips. Accounts help keep shared services available.</Typography>
    </Box>
    {notice && <Alert severity="error">{notice}</Alert>}
    <Button onClick={() => void google()} disabled={busy} variant="outlined" color="inherit" startIcon={<SvgIcon viewBox="0 0 24 24" sx={{ fontSize: 20 }}><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.52h3.24c1.9-1.75 2.98-4.33 2.98-7.37Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.4l-3.24-2.52c-.9.6-2.04.96-3.38.96-2.61 0-4.82-1.76-5.61-4.12H3.04v2.6A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.39 13.92a6 6 0 0 1 0-3.84v-2.6H3.04a10 10 0 0 0 0 9.04l3.35-2.6Z"/><path fill="#EA4335" d="M12 5.96c1.47 0 2.79.51 3.83 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.96 5.48l3.35 2.6C7.18 7.72 9.39 5.96 12 5.96Z"/></SvgIcon>}>Continue with Google</Button>
    <Divider sx={{ color: "text.secondary", fontSize: "0.875rem", "& .MuiDivider-wrapper": { flexShrink: 0, whiteSpace: "nowrap" } }}>or use email</Divider>
    <Stack component="form" spacing={2} onSubmit={submit} aria-label={creating ? "Create account" : "Sign in"} aria-busy={busy}>
      <TextField label="Email" type="email" name="email" autoComplete="email" required value={email} disabled={busy} onChange={e => setEmail(e.target.value)} slotProps={{ htmlInput: { autoCapitalize: "none", autoCorrect: "off" } }} />
      <TextField label="Password" type="password" name="password" autoComplete={creating ? "new-password" : "current-password"} required value={password} disabled={busy} onChange={e => setPassword(e.target.value)} slotProps={{ htmlInput: { minLength: creating ? 8 : undefined } }} helperText={creating ? "Use at least 8 characters." : undefined} />
      {creating && <TextField label="Confirm password" type="password" name="confirm-password" autoComplete="new-password" required value={confirm} disabled={busy} onChange={e => setConfirm(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />}
      <Button type="submit" variant="contained" disabled={busy}>{busy ? "Please wait…" : creating ? "Create account" : "Sign in"}</Button>
    </Stack>
    <Box sx={{ textAlign: "center" }}>
      <Typography variant="body2" color="text.secondary">{creating ? "Already have an account?" : "New to ArchRide?"}</Typography>
      <Button component={Link} prefetch={false} href={`${creating ? "/sign-in" : "/create-account"}?${new URLSearchParams({ next })}`}>{creating ? "Sign in" : "Create an account"}</Button>
    </Box>
    <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center" }}>Classes and saved journeys stay on this device, separated by account.</Typography>
  </Stack>;
}
