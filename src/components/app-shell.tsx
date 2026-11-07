"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BottomNavigation,
  BottomNavigationAction,
  Box,
  Stack,
  Typography,
} from "@mui/material";
import HomeRounded from "@mui/icons-material/HomeRounded";
import MapRounded from "@mui/icons-material/MapRounded";
import AltRouteRounded from "@mui/icons-material/AltRouteRounded";
import BookmarkRounded from "@mui/icons-material/BookmarkRounded";
import PersonRounded from "@mui/icons-material/PersonRounded";
import DirectionsBusRounded from "@mui/icons-material/DirectionsBusRounded";
import { NotificationBell } from "./notification-bell";
import { NotificationsProvider } from "./notifications-provider";

const destinations = [
  { label: "Home", href: "/", icon: HomeRounded },
  { label: "Map", href: "/map", icon: MapRounded },
  { label: "Plan", href: "/plan", icon: AltRouteRounded },
  { label: "Saved", href: "/saved", icon: BookmarkRounded },
  { label: "Profile", href: "/profile", icon: PersonRounded },
];
function Brand() {
  return (
    <Stack
      component={Link}
      prefetch={false}
      href="/"
      direction="row"
      spacing={1}
      sx={{
        alignItems: "center",
        textDecoration: "none",
        color: "text.primary",
        flexShrink: 0,
      }}
    >
      <DirectionsBusRounded sx={{ color: "primary.main", fontSize: 28 }} />
      <Typography
        component="span"
        sx={{ fontSize: "1.3rem", fontWeight: 750, letterSpacing: "-.045em" }}
      >
        ArchRide
      </Typography>
    </Stack>
  );
}
function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname().replace(/\/$/, "") || "/";
  const current = pathname === "/classes" ? "/profile" : pathname;
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <Box
        component="header"
        sx={{
          bgcolor: "background.paper",
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Box
          sx={{
            px: { xs: 2.5, sm: 4, xl: 5 },
            minHeight: 68,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
          }}
        >
          <Brand />
          <Box
            component="nav"
            aria-label="Primary navigation"
            sx={{
              display: { xs: "none", md: "flex" },
              alignSelf: "stretch",
              gap: 1,
            }}
          >
            {destinations.map(({ href, label }) => (
              <Box
                key={href}
                component={Link}
                prefetch={false}
                href={href}
                aria-current={current === href ? "page" : undefined}
                sx={{
                  minHeight: 48,
                  px: 2,
                  display: "flex",
                  alignItems: "center",
                  textDecoration: "none",
                  fontSize: ".9rem",
                  fontWeight: current === href ? 650 : 500,
                  color: current === href ? "primary.main" : "text.secondary",
                  borderBottom: "2px solid",
                  borderColor:
                    current === href ? "primary.main" : "transparent",
                  "&:hover": { color: "text.primary" },
                }}
              >
                {label}
              </Box>
            ))}
          </Box>
          <NotificationBell />
        </Box>
      </Box>
      <Box
        component="main"
        id="main-content"
        tabIndex={-1}
        sx={{
          minWidth: 0,
          px: { xs: 2.5, sm: 4, xl: 5 },
          pt: { xs: 3, md: 4 },
          pb: { xs: "calc(104px + env(safe-area-inset-bottom))", md: 4 },
        }}
      >
        {children}
        <Box
          component="footer"
          sx={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            columnGap: 2,
            rowGap: 1,
            mt: 5,
            pt: 2,
            borderTop: 1,
            borderColor: "divider",
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ flex: "1 1 220px" }}
          >
            Independent student project · Times are estimates.
          </Typography>
          <Link href="/privacy" prefetch={false} className="quiet-link">
            Privacy & data
          </Link>
          <a
            href="https://routes.uga.edu/"
            target="_blank"
            rel="noopener noreferrer"
            className="quiet-link"
          >
            UGA bus tracker ↗
          </a>
        </Box>
      </Box>
      <Box
        component="nav"
        aria-label="Primary navigation"
        sx={{
          display: { xs: "block", md: "none" },
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: "appBar",
          borderTop: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
          pb: "env(safe-area-inset-bottom)",
        }}
      >
        <BottomNavigation
          showLabels
          value={current}
          sx={{ height: 64, bgcolor: "transparent" }}
        >
          {destinations.map(({ href, label, icon: Icon }) => (
            <BottomNavigationAction
              key={href}
              component={Link}
              prefetch={false}
              href={href}
              value={href}
              label={label}
              aria-current={current === href ? "page" : undefined}
              icon={<Icon sx={{ fontSize: 22 }} />}
              sx={{
                minWidth: 0,
                px: 0.5,
                gap: 0.5,
                "& .MuiBottomNavigationAction-label": { fontSize: ".7rem" },
                "&.Mui-selected .MuiBottomNavigationAction-label": {
                  fontSize: ".7rem",
                  fontWeight: 700,
                },
              }}
            />
          ))}
        </BottomNavigation>
      </Box>
    </>
  );
}
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <NotificationsProvider>
      <Shell>{children}</Shell>
    </NotificationsProvider>
  );
}
