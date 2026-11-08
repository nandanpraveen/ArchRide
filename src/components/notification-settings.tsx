"use client";
import { useState } from "react";
import {
  Alert,
  Button,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import {
  MAX_BUS_LEAD_MINUTES,
  MIN_BUS_LEAD_MINUTES,
  type NotificationPreferences,
} from "@/lib/notifications";
import { useNotificationCenter } from "./notifications-provider";

const LEAD_CHOICES = Array.from(
  { length: MAX_BUS_LEAD_MINUTES - MIN_BUS_LEAD_MINUTES + 1 },
  (_, index) => MIN_BUS_LEAD_MINUTES + index,
);

export function NotificationSettings() {
  const { preferences, status, saveError, savePreferences, browser } =
    useNotificationCenter();
  const [saved, setSaved] = useState(false);

  async function change(next: NotificationPreferences) {
    setSaved(false);
    setSaved(await savePreferences(next));
  }

  return (
    <Stack
      component="section"
      spacing={2.5}
      aria-labelledby="notification-settings-heading"
    >
      <Typography
        component="h2"
        variant="h2"
        id="notification-settings-heading"
      >
        Leave-now reminders
      </Typography>
      <Stack spacing={1.5}>
        <Typography component="h3" variant="subtitle1">Browser notifications</Typography>
        {browser.support === "install" ? (
          <Typography variant="body2" color="text.secondary">On iPhone or iPad, open ArchRide in Safari, tap Share → Add to Home Screen, then open it from your Home Screen to enable notifications.</Typography>
        ) : browser.support === "unsupported" ? (
          <Typography variant="body2" color="text.secondary">This browser does not support push notifications. In-app reminders still work while ArchRide is open.</Typography>
        ) : (
          <>
            <Typography variant="body2" color="text.secondary">Get leave-time reminders even when ArchRide is closed. Enabling shares this browser’s push subscription, watched buses, and the next seven days of reminder times with ArchRide.</Typography>
            <Button variant={browser.enabled ? "outlined" : "contained"} disabled={browser.busy || browser.support === "loading" || status !== "ready"} onClick={() => void (browser.enabled ? browser.disable() : browser.enable())} sx={{ alignSelf: "flex-start" }}>
              {browser.busy ? "Updating notifications…" : browser.enabled ? "Turn off browser notifications" : "Enable browser notifications"}
            </Button>
          </>
        )}
        {browser.permission === "denied" && <Typography variant="body2" color="text.secondary">Notifications are blocked. Allow ArchRide in your browser’s site settings, then enable them here.</Typography>}
        {browser.enabled && <Typography role="status" variant="body2" color="text.secondary">Browser notifications enabled.{browser.syncedAt ? " Reminders synced." : ""}</Typography>}
        {browser.error && <Alert severity="error" action={<Button color="inherit" disabled={browser.busy} onClick={() => void browser.retry()}>Retry</Button>}>{browser.error}</Alert>}
      </Stack>
      {status === "error" && (
        <Alert severity="warning">
          Your saved settings could not be loaded, so defaults are shown.
        </Alert>
      )}
      <FormControlLabel
        control={
          <Switch
            checked={preferences.leaveNowEnabled}
            disabled={status !== "ready"}
            onChange={(event) =>
              void change({
                ...preferences,
                leaveNowEnabled: event.target.checked,
              })
            }
          />
        }
        label="Remind me when a watched bus is close"
        labelPlacement="start"
        sx={{ m: 0, minHeight: 44, justifyContent: "space-between", gap: 2, "& .MuiFormControlLabel-label": { fontSize: ".925rem" } }}
      />
      <TextField
        select
        label="How early to remind me"
        value={preferences.busLeadMinutes}
        disabled={status !== "ready" || !preferences.leaveNowEnabled}
        onChange={(event) =>
          void change({
            ...preferences,
            busLeadMinutes: Number(event.target.value),
          })
        }
        sx={{ maxWidth: 320 }}
      >
        {LEAD_CHOICES.map((minutes) => (
          <MenuItem key={minutes} value={minutes}>
            {minutes} {minutes === 1 ? "minute" : "minutes"}
          </MenuItem>
        ))}
      </TextField>
      {([
        ["classRemindersEnabled", "Class reminders"],
        ["alertsEnabled", "Service alert updates"],
        ["tripUpdatesEnabled", "Active trip updates"],
      ] as const).map(([key, label]) => (
        <FormControlLabel key={key} control={<Switch checked={preferences[key]} disabled={status !== "ready"} onChange={(_, checked) => void change({ ...preferences, [key]: checked })} />} label={label} labelPlacement="start" sx={{ m: 0, minHeight: 44, justifyContent: "space-between", gap: 2, "& .MuiFormControlLabel-label": { fontSize: ".925rem" } }} />
      ))}
      <Stack component="details" sx={{ display: "block" }}>
        <Typography component="summary" variant="body2" color="text.secondary" sx={{ cursor: "pointer", py: 1.5 }}>About reminders</Typography>
        <Typography variant="body2" color="text.secondary">Start a bus trip to include the walk to its boarding stop and your safety buffer. Start a walking trip with an arrive-by time for a building reminder. Class reminders use your default origin and a cached walking route; without one, you get a class heads-up. Enable each class’s reminder switch. Reopen ArchRide weekly to refresh reminders. Your location is not tracked after closing the app; replan if you move. Delivery can be delayed by your device or connection.</Typography>
      </Stack>
      {saveError && <Alert severity="error">{saveError}</Alert>}
      {saved && !saveError && (
        <Typography role="status" variant="body2">
          Saved on this device.
        </Typography>
      )}
    </Stack>
  );
}
