"use client";
import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Box, Button, Skeleton, Stack, Typography } from "@mui/material";
import DirectionsBusRounded from "@mui/icons-material/DirectionsBusRounded";
import { useAuth } from "./auth-provider";
import { BASE_PATH } from "@/lib/site";

const publicRoutes = new Set(["/sign-in", "/create-account", "/auth/callback", "/privacy"]);
export function AuthGate({ children, publicContent }: { children: React.ReactNode; publicContent: React.ReactNode }) {
  const auth = useAuth(), pathname = usePathname().replace(/\/$/, "") || "/", router = useRouter();
  const publicPage = publicRoutes.has(pathname);
  useEffect(() => {
    if (publicPage || auth.status !== "signed-out") return;
    const path = window.location.pathname.replace(new RegExp(`^${BASE_PATH}`), "");
    router.replace(`/sign-in?${new URLSearchParams({ next: path + window.location.search + window.location.hash })}`);
  }, [auth.status, pathname, publicPage, router]);
  if (!publicPage && auth.status === "signed-in") return children;
  return <Box sx={{ minHeight: "100dvh", display: "flex", flexDirection: "column", bgcolor: "background.paper" }}>
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <Box component="header" sx={{ px: { xs: 2.5, sm: 4 }, minHeight: 68, display: "flex", alignItems: "center", borderBottom: 1, borderColor: "divider" }}>
      <Stack component={Link} href="/" direction="row" spacing={1} sx={{ alignItems: "center", color: "text.primary", textDecoration: "none" }}><DirectionsBusRounded color="primary"/><Typography sx={{ fontSize: "1.3rem", fontWeight: 750 }}>ArchRide</Typography></Stack>
    </Box>
    <Box component="main" id="main-content" tabIndex={-1} sx={{ px: 2.5, py: 3, flex: 1, minWidth: 0 }}>
      {publicPage ? publicContent : auth.status === "unavailable" ? <Stack spacing={2} sx={{ maxWidth: 440, mx: "auto", py: 5 }}>
        <Typography component="h1" variant="h1">Sign-in is unavailable</Typography><Typography color="text.secondary">We couldn’t check your session. Check your connection and try again.</Typography><Button variant="contained" onClick={() => void auth.refresh()}>Try again</Button><Button component={Link} href="/sign-in">Go to sign in</Button>
      </Stack> : <Stack spacing={2} sx={{ maxWidth: 440, mx: "auto", py: 5 }}><Typography component="h1" variant="h1">ArchRide</Typography><Typography role="status" color="text.secondary">Checking your session…</Typography><Skeleton variant="rounded" height={56}/><Skeleton variant="rounded" height={56}/></Stack>}
    </Box>
    <Box component="footer" sx={{ p: 2.5, pb: "max(20px, env(safe-area-inset-bottom))", textAlign: "center" }}><Link className="quiet-link" href="/privacy" prefetch={false}>Privacy & data</Link><Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>Independent student project · Not affiliated with UGA.</Typography></Box>
  </Box>;
}
