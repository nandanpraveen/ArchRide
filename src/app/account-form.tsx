"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import { createClient } from "@/lib/supabase/browser-client";

type FormMode = "create-account" | "sign-in" | "forgot-password" | "reset-password";
type Notice = { kind: "error" | "success"; text: string };
const titles: Record<FormMode, string> = {
  "create-account": "Create an account",
  "sign-in": "Sign in",
  "forgot-password": "Forgot password?",
  "reset-password": "Reset your password",
};
const submitLabels: Record<FormMode, string> = {
  "create-account": "Create account",
  "sign-in": "Sign in",
  "forgot-password": "Send reset link",
  "reset-password": "Update password",
};

export default function AccountForm({ formMode }: { formMode: FormMode }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmedPassword, setConfirmedPassword] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<"checking" | "valid" | "invalid">("checking");
  const submitting = useRef(false);
  const reset = formMode === "reset-password";
  const confirmsPassword = reset || formMode === "create-account";
  const configured = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  useEffect(() => {
    if (!reset) return;
    let active = true;
    async function verifySession() {
      try {
        const { data, error } = await createClient().auth.getUser();
        if (active) setRecovery(!error && data.user && !data.user.is_anonymous ? "valid" : "invalid");
      } catch {
        if (active) setRecovery("invalid");
      }
    }
    void verifySession();
    return () => { active = false; };
  }, [reset]);

  function openProfile() {
    router.replace("/profile");
    router.refresh();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !event.currentTarget.checkValidity()) return;
    if (!configured) {
      setNotice({ kind: "error", text: "Account services are unavailable right now. You can continue browsing as a guest." });
      return;
    }
    if (confirmsPassword && password !== confirmedPassword) {
      setNotice({ kind: "error", text: "Passwords do not match. Please try again." });
      return;
    }
    if (reset && recovery !== "valid") return;
    submitting.current = true;
    setLoading(true);
    setNotice(null);
    const normalizedEmail = email.trim().toLowerCase();
    try {
      const supabase = createClient();
      if (formMode === "create-account") {
        const { data, error } = await supabase.auth.signUp({ email: normalizedEmail, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
        if (error) {
          setNotice({ kind: "error", text: "Unable to create an account. Check your details and try again." });
        } else if (data.session) {
          openProfile();
        } else {
          setConfirmationEmail(normalizedEmail);
          setPassword("");
          setConfirmedPassword("");
          setNotice({ kind: "success", text: "Check your email for a confirmation link. After confirming, you can sign in." });
        }
      } else if (formMode === "sign-in") {
        const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
        if (error || !data.session) {
          if (error?.code === "email_not_confirmed") {
            setConfirmationEmail(normalizedEmail);
            setNotice({ kind: "error", text: "Confirm your email before signing in. Check your inbox or resend the confirmation link." });
          } else setNotice({ kind: "error", text: "Unable to sign in. Check your email and password and try again." });
        } else openProfile();
      } else if (formMode === "forgot-password") {
        const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo: `${window.location.origin}/auth/callback?next=/reset-password` });
        setNotice(error
          ? { kind: "error", text: "Unable to request a reset link right now. Wait a moment and try again." }
          : { kind: "success", text: "If an account exists for this email, a password reset link is on its way. Check your email." });
      } else {
        // Recheck with Auth at submission too: the recovery session may have expired while the form was open.
        const { data, error: sessionError } = await supabase.auth.getUser();
        if (sessionError || !data.user || data.user.is_anonymous) {
          setRecovery("invalid");
          return;
        }
        const { error } = await supabase.auth.updateUser({ password });
        if (error) setNotice({ kind: "error", text: "Unable to update your password. Request a new reset link and try again." });
        else openProfile();
      }
    } catch {
      setNotice({ kind: "error", text: "Account services could not be reached. Check your connection and try again." });
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  async function resendConfirmation() {
    if (!confirmationEmail || submitting.current) return;
    submitting.current = true;
    setLoading(true);
    setNotice(null);
    try {
      const { error } = await createClient().auth.resend({ type: "signup", email: confirmationEmail, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
      setNotice(error
        ? { kind: "error", text: "Unable to resend confirmation right now. Wait a moment and try again." }
        : { kind: "success", text: "Check your email for a confirmation link." });
    } catch {
      setNotice({ kind: "error", text: "Account services could not be reached. Check your connection and try again." });
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  return <Paper component="section" variant="outlined" aria-labelledby="account-heading" sx={{ p: { xs: 2, sm: 3 }, maxWidth: 480, width: "100%", minWidth: 0 }}>
    <Stack spacing={3}>
      <Typography component="h1" variant="h1" id="account-heading">{titles[formMode]}</Typography>
      <Typography color="text.secondary">An account keeps your personal travel information private. Public transit browsing is available to everyone.</Typography>
      {!configured && <Alert severity="warning">Account services are unavailable right now. You can continue browsing as a guest.</Alert>}
      {notice && <Alert severity={notice.kind} role={notice.kind === "error" ? "alert" : "status"}>{notice.text}</Alert>}
      {reset && recovery === "checking" && configured && <Typography role="status">Checking your reset session…</Typography>}
      {reset && recovery === "invalid" && <Alert severity="error">Your reset session is missing, expired, or could not be verified. Request a new reset link.</Alert>}
      <Stack component="form" spacing={2} onSubmit={submit} aria-busy={loading}>
        {!reset && <TextField id="email" name="email" label="Email" type="email" autoComplete="email" required value={email} disabled={loading} onChange={(event) => { setEmail(event.target.value); setConfirmationEmail(null); }} slotProps={{ htmlInput: { autoCapitalize: "none", autoCorrect: "off" } }} />}
        {formMode !== "forgot-password" && <TextField id="password" name="password" label="Password" type="password" autoComplete={formMode === "sign-in" ? "current-password" : "new-password"} required value={password} disabled={loading || (reset && recovery !== "valid")} onChange={(event) => setPassword(event.target.value)} slotProps={{ htmlInput: { minLength: 6 } }} helperText={confirmsPassword ? "Use at least 6 characters." : undefined} />}
        {confirmsPassword && <TextField id="confirm-password" name="confirm-password" label="Confirm password" type="password" autoComplete="new-password" required value={confirmedPassword} disabled={loading || (reset && recovery !== "valid")} onChange={(event) => setConfirmedPassword(event.target.value)} slotProps={{ htmlInput: { minLength: 6 } }} />}
        <Button type="submit" variant="contained" disabled={loading || !configured || (reset && recovery !== "valid")}>{loading ? "Please wait…" : submitLabels[formMode]}</Button>
        {confirmationEmail && <Button type="button" variant="outlined" disabled={loading || !configured} onClick={resendConfirmation}>Resend confirmation</Button>}
      </Stack>
      <Stack spacing={1}>
        {formMode !== "sign-in" && <Button component={Link} href="/sign-in" variant="text">Sign in</Button>}
        {formMode !== "create-account" && <Button component={Link} href="/create-account" variant="text">Create an account</Button>}
        {formMode !== "forgot-password" && <Button component={Link} href="/forgot-password" variant="text">{reset ? "Request a new reset link" : "Forgot password?"}</Button>}
        <Button component={Link} href="/" variant="outlined">Continue as guest</Button>
      </Stack>
    </Stack>
  </Paper>;
}
