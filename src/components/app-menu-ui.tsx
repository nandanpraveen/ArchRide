"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AppBar,
  BottomNavigation,
  BottomNavigationAction,
  Box,
  Chip,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
} from "@mui/material";
import HomeRounded from "@mui/icons-material/HomeRounded";
import MapRounded from "@mui/icons-material/MapRounded";
import AltRouteRounded from "@mui/icons-material/AltRouteRounded";
import BookmarkRounded from "@mui/icons-material/BookmarkRounded";
import PersonRounded from "@mui/icons-material/PersonRounded";
import DirectionsBusRounded from "@mui/icons-material/DirectionsBusRounded";
import { ReactNode, useState } from "react";
import { getUser } from "@/app/get-user";
const destinations = [
  { label: "Home", href: "/", icon: HomeRounded },
  { label: "Map", href: "/map", icon: MapRounded },
  { label: "Plan", href: "/plan", icon: AltRouteRounded },
  { label: "Saved", href: "/saved", icon: BookmarkRounded },
  { label: "Profile", href: "/profile", icon: PersonRounded },
];

interface AppMenuUIProps {
  children: React.ReactNode;
  signedIn: boolean;
}
export function AppMenuUI({ signedIn, children }: AppMenuUIProps) {
  const pathname = usePathname();

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      {signedIn ? (
        <AppBar
          position="static"
          color="transparent"
          elevation={0}
          sx={{ borderBottom: 1, borderColor: "divider" }}
        >
          <Toolbar sx={{ gap: 1.5, minHeight: 72 }}>
            <DirectionsBusRounded color="primary" sx={{ fontSize: 30 }} />
            <Typography
              component={Link}
              href="/"
              variant="h6"
              sx={{
                color: "text.primary",
                textDecoration: "none",
                fontWeight: 700,
              }}
            >
              ArchRide
            </Typography>
            <Box sx={{ flexGrow: 1 }} />
            <Chip size="small" variant="outlined" label="UGA campus" />
          </Toolbar>
        </AppBar>
      ) : (
        ""
      )}
      <Box sx={{ display: "flex", maxWidth: 1280, mx: "auto" }}>
        {signedIn ? (
          // Menu
          <Box
            component="nav"
            aria-label="Primary navigation"
            sx={{
              display: { xs: "none", md: "block" },
              width: 220,
              flexShrink: 0,
              pt: 4,
              px: 2,
            }}
          >
            <List>
              {destinations.map(({ href, label, icon: Icon }) => (
                <ListItemButton
                  key={href}
                  component={Link}
                  href={href}
                  selected={pathname === href}
                  aria-current={pathname === href ? "page" : undefined}
                  sx={{ borderRadius: 8, mb: 0.75, minHeight: 52 }}
                >
                  <ListItemIcon sx={{ minWidth: 42 }}>
                    <Icon color={pathname === href ? "primary" : "inherit"} />
                  </ListItemIcon>
                  <ListItemText primary={label} />
                </ListItemButton>
              ))}
            </List>
          </Box>
        ) : (
          ""
        )}
        {children}
        {signedIn ? (
          <div>
            <Typography
              component="footer"
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mt: 8, maxWidth: "65ch" }}
            >
              A student-built KTP project. Not affiliated with or endorsed by
              UGA. Transit estimates depend on available source data.
            </Typography>
            <Box
              component="main"
              id="main-content"
              tabIndex={-1}
              sx={{
                flex: 1,
                minWidth: 0,
                px: { xs: 2.5, sm: 4 },
                pt: { xs: 4, md: 6 },
                pb: 16,
              }}
            ></Box>{" "}
          </div>
        ) : (
          ""
        )}
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
          bgcolor: "background.default",
          pb: "env(safe-area-inset-bottom)",
        }}
      >
        <BottomNavigation showLabels value={pathname} sx={{ height: 76 }}>
          {destinations.map(({ href, label, icon: Icon }) => (
            <BottomNavigationAction
              key={href}
              component={Link}
              href={href}
              value={href}
              label={label}
              aria-current={pathname === href ? "page" : undefined}
              icon={<Icon />}
              sx={{ minWidth: 0, px: 0.5 }}
            />
          ))}
        </BottomNavigation>
      </Box>
    </>
  );
}
