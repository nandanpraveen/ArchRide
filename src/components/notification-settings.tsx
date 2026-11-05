"use client";
import { useState } from "react";
import {
  Alert,
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
  const { preferences, status, saveError, savePreferences } =
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
      <Typography color="text.secondary" variant="body2">Only while ArchRide is open.</Typography>
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
        sx={{ m: 0, justifyContent: "space-between", gap: 2, "& .MuiFormControlLabel-label": { fontSize: ".925rem" } }}
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
        <FormControlLabel key={key} control={<Switch checked={preferences[key]} disabled={status !== "ready"} onChange={(_, checked) => void change({ ...preferences, [key]: checked })} />} label={label} labelPlacement="start" sx={{ m: 0, justifyContent: "space-between", gap: 2, "& .MuiFormControlLabel-label": { fontSize: ".925rem" } }} />
      ))}
      <Stack component="details" sx={{ display: "block" }}>
        <Typography component="summary" variant="body2" color="text.secondary" sx={{ cursor: "pointer", py: 1.5 }}>About reminders</Typography>
        <Typography variant="body2" color="text.secondary">Reminders are not sent as texts, emails or phone notifications. Active trips include walking time and your safety buffer. Class reminders also need the class’s own reminder switch enabled.</Typography>
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
