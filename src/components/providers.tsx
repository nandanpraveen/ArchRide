"use client";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import { CssBaseline, ThemeProvider } from "@mui/material";
import theme from "@/theme";
import { AuthProvider } from "./auth-provider";
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AppRouterCacheProvider options={{ enableCssLayer: true }}>
      <ThemeProvider
        theme={theme}
        defaultMode="system"
        modeStorageKey="archride.mode"
        disableTransitionOnChange
      >
        <CssBaseline />
        <AuthProvider>{children}</AuthProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
