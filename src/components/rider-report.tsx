"use client";
import { useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { publicTransitClient } from "@/lib/supabase/public";
export function RiderReport({
  arrivals,
}: {
  arrivals: { id: string; label: string }[];
}) {
  const [open, setOpen] = useState(false),
    [arrival, setArrival] = useState(""),
    [kind, setKind] = useState("arrival"),
    [minutesAgo, setMinutesAgo] = useState("0"),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  async function submit() {
    if (!consent || !arrival) return;
    const ago = Number(minutesAgo);
    if (!Number.isFinite(ago) || ago < 0 || ago > 60) {
      setNotice("Enter an observation time within the past hour.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const client = publicTransitClient();
      if (!client) throw new Error("unavailable");
      const { data, error } = await client.functions.invoke("rider-report", { body: {
        arrivalId: arrival,
        eventKind: kind,
        eventAt: new Date(Date.now() - ago * 60000).toISOString(),
        consent: true,
      } });
      if (error) {
        const response = (error as { context?: Response }).context;
        if (response?.status === 429) {
          const wait = Number(response.headers.get("retry-after"));
          setNotice(`Reporting is busy. Try again in ${Number.isFinite(wait) && wait > 0 ? Math.ceil(wait / 60) : 1} minute(s).`);
          return;
        }
      }
      if (error) throw error;
      setNotice(
        data.duplicate ? "This bus event has already been reported. Additional reports do not count as independent evidence." : data.validation_state === "rejected"
          ? "Your report was recorded but could not be matched to reliable source data. It will not affect predictions."
          : "Report received. It will only help prediction training after independent validation.",
      );
    } catch {
      setNotice(
        "Your report was not submitted. You may have reported this event already, reached the limit, or lost your connection.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={!arrivals.length}>
        Report a bus observation
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Help improve campus arrivals</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <Typography color="text.secondary">
              Report an arrival, departure, or boarding that you personally
              observed at this stop. Reports are checked against route, timing,
              and independent source evidence. No rider location history is
              recorded.
            </Typography>
            <>
                <TextField
                  select
                  label="Bus observed"
                  value={arrival}
                  onChange={(e) => setArrival(e.target.value)}
                >
                  {arrivals.map((a) => (
                    <MenuItem key={a.id} value={a.id}>
                      {a.label}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  label="What happened?"
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  <MenuItem value="arrival">The bus arrived</MenuItem>
                  <MenuItem value="departure">The bus departed</MenuItem>
                  <MenuItem value="boarding">I boarded the bus</MenuItem>
                </TextField>
                <TextField
                  label="How many minutes ago?"
                  type="number"
                  value={minutesAgo}
                  onChange={(e) => setMinutesAgo(e.target.value)}
                  slotProps={{ htmlInput: { min: 0, max: 60, step: 1 } }}
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={consent}
                      onChange={(_, checked) => setConsent(checked)}
                    />
                  }
                  label="Use this observation for transit validation and prediction research."
                />
            </>
            {notice && (
              <Alert severity="info" role="status">
                {notice}
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={busy}>
            Close
          </Button>
          <Button
            onClick={submit}
            variant="contained"
            disabled={busy || !consent || !arrival}
          >
            {busy ? "Submitting…" : "Submit observation"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
