"use client";
import { useState } from "react";
import { Alert, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography } from "@mui/material";
import { MAX_BUS_LEAD_MINUTES, MIN_BUS_LEAD_MINUTES, type NotificationPreferences } from "@/lib/notifications";
import { useNotificationCenter } from "./notifications-provider";

const LEAD_CHOICES = Array.from(
  { length: MAX_BUS_LEAD_MINUTES - MIN_BUS_LEAD_MINUTES + 1 },
  (_, index) => MIN_BUS_LEAD_MINUTES + index,
);

// Only leave-now reminders exist so far, so they are the only settings shown.
export function NotificationSettings() {
  const { preferences, status, source, saveError, savePreferences } = useNotificationCenter();
  const [saved, setSaved] = useState(false);

  async function change(next: NotificationPreferences) {
    setSaved(false);
    setSaved(await savePreferences(next));
  }

  return (
    <Stack component="section" spacing={2} aria-labelledby="notification-settings-heading">
      <Typography component="h2" variant="h2" id="notification-settings-heading">
        Leave-now reminders
      </Typography>
      <Typography color="text.secondary" variant="body2" sx={{ maxWidth: "65ch" }}>
        When a bus you are watching is close, ArchRide shows a reminder inside the app. This only works while ArchRide is
        open in your browser. Reminders are not sent as texts, emails or phone notifications. The buses you watch are
        kept on this device.
      </Typography>
      {status === "error" && <Alert severity="warning">Your saved settings could not be loaded, so defaults are shown.</Alert>}
      <FormControlLabel
        control={
          <Switch
            checked={preferences.leaveNowEnabled}
            disabled={status !== "ready"}
            onChange={(event) => void change({ ...preferences, leaveNowEnabled: event.target.checked })}
          />
        }
        label="Remind me when a watched bus is close"
      />
      <TextField
        select
        label="How early to remind me"
        value={preferences.busLeadMinutes}
        disabled={status !== "ready" || !preferences.leaveNowEnabled}
        onChange={(event) => void change({ ...preferences, busLeadMinutes: Number(event.target.value) })}
        helperText="Minutes before the bus is due. Walking time to the stop is not estimated."
        sx={{ maxWidth: 320 }}
      >
        {LEAD_CHOICES.map((minutes) => (
          <MenuItem key={minutes} value={minutes}>
            {minutes} {minutes === 1 ? "minute" : "minutes"}
          </MenuItem>
        ))}
      </TextField>
      {saveError && <Alert severity="error">{saveError}</Alert>}
      {saved && !saveError && (
        <Typography role="status" variant="body2">
          {source === "account" ? "Saved to your account." : "Saved on this device."}
        </Typography>
      )}
    </Stack>
  );
}
