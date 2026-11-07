"use client";
import { isCurrentDeviceKey } from "@/lib/device-storage";
import { useAuth } from "@/components/auth-provider";
import Link from "next/link";
import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { usePersonal } from "@/components/personal-provider";
import { NotificationSettings } from "@/components/notification-settings";
import { PlaceSearch } from "@/components/place-search";
import { placeRef, type TravelPreferences } from "@/lib/personal";

function TravelForm() {
  const personal = usePersonal();
  const [draft, setDraft] = useState<TravelPreferences>(personal.prefs);
  const [saved, setSaved] = useState(false);
  const update = <K extends keyof TravelPreferences>(
    key: K,
    value: TravelPreferences[K],
  ) => {
    setSaved(false);
    setDraft((p) => ({ ...p, [key]: value }));
  };
  return (
    <Box
      component="form"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaved(await personal.savePreferences(draft));
      }}
      sx={{ minWidth: 0 }}
    >
      <Stack spacing={2.5}>
        <Box>
          <Typography component="h2" variant="h2">
            Travel
          </Typography>

        </Box>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "minmax(0,1fr)", sm: "repeat(2,minmax(0,1fr))" },
            gap: 2,
          }}
        >
          <TextField
            select
            label="Walking pace"
            value={draft.walkingSpeed}
            onChange={(e) => update("walkingSpeed", Number(e.target.value))}
          >
            <MenuItem value={0.9}>Relaxed</MenuItem>
            <MenuItem value={1.34}>Regular</MenuItem>
            <MenuItem value={1.7}>Brisk</MenuItem>
          </TextField>
          <TextField
            label="Arrival buffer (minutes)"
            type="number"
            value={draft.buffer}
            onChange={(e) => update("buffer", Number(e.target.value))}
            slotProps={{ htmlInput: { min: 0, max: 30, step: 1 } }}
            helperText="Extra time before boarding and class."
          />
        </Box>
        <TextField
          select
          label="Appearance"
          value={draft.theme}
          onChange={(e) =>
            update("theme", e.target.value as TravelPreferences["theme"])
          }
        >
          <MenuItem value="system">Match device</MenuItem>
          <MenuItem value="light">Light</MenuItem>
          <MenuItem value="dark">Dark</MenuItem>
        </TextField>
        <Box>
          <PlaceSearch
            label="Default starting point"
            inputId="default-origin"
            onSelect={(p) => update("defaultOrigin", p ? placeRef(p) : null)}
          />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {draft.defaultOrigin
              ? `Current default: ${draft.defaultOrigin.name}`
              : "Choose a campus building or stop."}
          </Typography>
          {draft.defaultOrigin && (
            <Button onClick={() => update("defaultOrigin", null)}>
              Clear default
            </Button>
          )}
        </Box>
        <Box>
          <Typography component="h3" variant="h3" sx={{ mb: 1.5 }}>
            Quiet hours
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Athens time. Leave both blank to allow reminders all day.
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              type="time"
              label="Quiet hours start"
              value={draft.quietStart}
              onChange={(e) => update("quietStart", e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              type="time"
              label="Quiet hours end"
              value={draft.quietEnd}
              onChange={(e) => update("quietEnd", e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>
        </Box>
        {saved && (
          <Typography color="success.main" variant="body2" role="status">
            Preferences saved on this device.
          </Typography>
        )}
        <Button
          type="submit"
          variant="contained"
          disabled={personal.busy}
          sx={{ alignSelf: "flex-start" }}
        >
          {personal.busy ? "Saving…" : "Save preferences"}
        </Button>
      </Stack>
    </Box>
  );
}
export default function ProfileUI() {
  const auth = useAuth();
  const personal = usePersonal();
  const [clearing, setClearing] = useState(false);
  const [notice, setNotice] = useState("");
  const [resetKey, setResetKey] = useState(0);
  function clearDevice() {
    try {
      for (const storage of [localStorage, sessionStorage]) {
        for (const key of Object.keys(storage))
          if (isCurrentDeviceKey(key)) storage.removeItem(key);
      }
      window.dispatchEvent(new Event("archride:device-data-cleared"));
      personal.reload();
      setResetKey(n => n + 1);
      setClearing(false);
      setNotice("Your ArchRide data was cleared from this browser.");
    } catch { setNotice("This browser could not clear its saved data. Use your browser’s site-data settings."); }
  }
  return <Stack spacing={4} sx={{ maxWidth: 1440, mx: "auto" }}>
    <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}>
      <Box><Typography component="h1" variant="h1">Profile</Typography><Typography color="text.secondary" variant="body2" sx={{ mt: 1, overflowWrap: "anywhere" }}>{auth.user?.email}</Typography></Box>
      <Button variant="outlined" onClick={async () => { if (!await auth.signOut()) setNotice("Couldn’t sign out. Check your connection and try again."); }}>Sign out</Button>
    </Stack>
    {notice && <Alert severity="info" role="status">{notice}</Alert>}
    {personal.error && <Alert severity="error" action={<Button onClick={personal.reload} color="inherit">Retry</Button>}>{personal.error}</Alert>}
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr)", lg: "minmax(0,1.2fr) minmax(0,1fr)" }, gap: { xs: 4, lg: 6 }, alignItems: "start" }}>
      {personal.ready ? <TravelForm key={resetKey} /> : <Skeleton variant="rounded" height={400} />}
      <Box sx={{ minWidth: 0, borderLeft: { lg: "1px solid var(--mui-palette-divider)" }, borderTop: { xs: "1px solid var(--mui-palette-divider)", lg: 0 }, pl: { lg: 5 }, pt: { xs: 4, lg: 0 } }}>
        <NotificationSettings />
      </Box>
    </Box>
    <Box sx={{ borderTop: 1, borderColor: "divider", pt: 2 }}>
      <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: "wrap", ml: -1.5 }}>
        <Button component={Link} href="/classes">Edit class schedule</Button>
        <Button component={Link} href="/saved">View saved journeys</Button>
        <Button component={Link} href="/notifications">View notifications</Button>
      </Stack>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { xs: "start", sm: "center" }, justifyContent: "space-between", mt: 2 }}>
        <Box component="details" sx={{ minWidth: 0 }}>
          <Box component="summary" sx={{ cursor: "pointer", py: 1.5, fontSize: ".875rem", color: "text.secondary" }}>Your data stays on this device</Box>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: "60ch", mb: 1 }}>Saved journeys, classes, preferences, and notifications stay in this browser. They do not sync to other devices. GPS location is never saved as a default.</Typography>
          <Button component={Link} href="/privacy" sx={{ ml: -1.5 }}>Privacy & data</Button>
        </Box>
        <Button color="error" onClick={() => setClearing(true)} sx={{ flexShrink: 0 }}>Clear device data</Button>
      </Stack>
    </Box>
    <Dialog open={clearing} onClose={() => setClearing(false)} aria-labelledby="clear-device-title">
      <DialogTitle id="clear-device-title">Clear ArchRide data on this device?</DialogTitle>
      <DialogContent><Typography>This removes saved journeys, classes, preferences, your active trip, and notifications from this browser. This cannot be undone.</Typography></DialogContent>
      <DialogActions><Button onClick={() => setClearing(false)}>Keep my data</Button><Button color="error" onClick={clearDevice}>Clear device data</Button></DialogActions>
    </Dialog>
  </Stack>;
}
