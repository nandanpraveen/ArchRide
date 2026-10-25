"use client";
import { useState, useRef, useSyncExternalStore } from "react";
import {
  Alert,
  Button,
  Paper,
  Stack,
  TextField,
  Typography,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
} from "@mui/material";
import {
  arriveBy,
  assessDeadline,
  campusDeadline,
  type JourneyCandidate,
} from "@/lib/transit/deadlines";
import { useArrivalClock } from "./arrival-status";
const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;
/** Task 5 supplies complete verified candidates; task 6 owns deadline interpretation. */
export function DeadlineSearch({
  candidates = [],
}: {
  candidates?: JourneyCandidate[];
}) {
  const ready = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const [local, setLocal] = useState("");
  const [buffer, setBuffer] = useState("5");
  const [submitted, setSubmitted] = useState(false);
  const [fold, setFold] = useState<"earlier" | "later" | undefined>();
  const bufferRef = useRef<HTMLInputElement>(null);
  const first = useRef<HTMLInputElement>(null);
  const now = useArrivalClock();
  const ambiguous =
    !campusDeadline(local) && !!campusDeadline(local, "earlier");
  const deadline = campusDeadline(local, fold);
  const seconds = Number(buffer) * 60;
  const deadlineInvalid = !deadline || Date.parse(deadline) <= now;
  const bufferInvalid =
    !buffer.trim() || !Number.isFinite(seconds) || seconds < 0;
  const invalid = deadlineInvalid || bufferInvalid;
  const late =
    deadline && !invalid
      ? candidates
          .map((candidate) => ({
            candidate,
            assessment: assessDeadline(candidate, deadline, seconds, now),
          }))
          .find(({ assessment }) => assessment.status === "likely_late")
      : undefined;
  const format = (value: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
      month: "short",
      day: "numeric",
      timeZoneName: "short",
    }).format(Date.parse(value));
  const results =
    deadline && !invalid ? arriveBy(candidates, deadline, seconds, now) : [];
  return (
    <Paper
      component="section"
      variant="outlined"
      sx={{ p: 3 }}
      aria-labelledby="deadline-heading"
    >
      <Stack
        component="form"
        noValidate
        spacing={2}
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(true);
          if (deadlineInvalid) first.current?.focus();
          else if (bufferInvalid) bufferRef.current?.focus();
        }}
      >
        <Typography id="deadline-heading" component="h2" variant="h2">
          Arrive by
        </Typography>
        <TextField
          disabled={!ready}
          inputRef={first}
          label="Campus arrival deadline"
          type="datetime-local"
          value={local}
          onChange={(e) => {
            setLocal(e.target.value);
            setFold(undefined);
            setSubmitted(false);
          }}
          slotProps={{ inputLabel: { shrink: true } }}
          error={submitted && deadlineInvalid}
          helperText={
            submitted && deadlineInvalid
              ? "Enter a future campus time. For a repeated hour, choose its first or second occurrence below."
              : "America/New_York campus time, regardless of your device timezone."
          }
        />
        {ambiguous && (
          <FormControl>
            <FormLabel id="campus-fold-label">
              This campus hour occurs twice
            </FormLabel>
            <RadioGroup
              aria-labelledby="campus-fold-label"
              value={fold ?? ""}
              onChange={(e) => {
                setFold(e.target.value as "earlier" | "later");
                setSubmitted(false);
              }}
            >
              <FormControlLabel
                value="earlier"
                control={<Radio />}
                label="First occurrence (EDT)"
              />
              <FormControlLabel
                value="later"
                control={<Radio />}
                label="Second occurrence (EST)"
              />
            </RadioGroup>
          </FormControl>
        )}
        <TextField
          disabled={!ready}
          inputRef={bufferRef}
          error={submitted && bufferInvalid}
          helperText={
            submitted && bufferInvalid
              ? "Enter a nonnegative buffer in minutes."
              : undefined
          }
          label="Arrival buffer (minutes)"
          type="number"
          value={buffer}
          onChange={(e) => {
            setBuffer(e.target.value);
            setSubmitted(false);
          }}
          slotProps={{ htmlInput: { min: 0, step: 1 } }}
        />
        <Button
          disabled={!ready}
          type="submit"
          variant="contained"
          sx={{ alignSelf: "flex-start" }}
        >
          Find trips arriving by this time
        </Button>
        {submitted &&
          !invalid &&
          (!results.length ? (
            late ? (
              <Alert severity="warning">
                Estimate: likely late. {late.assessment.reason} Destination
                arrival {format(late.candidate.destinationArrivalAt)}. No
                supported journey meets your deadline.
              </Alert>
            ) : (
              <Alert severity="info">
                Insufficient data: no complete supported journey meets this
                deadline. Future trips need an operating schedule and verified
                walking times. Current bus predictions cannot be reused hours
                into the future.
              </Alert>
            )
          ) : (
            results.map(({ candidate, assessment }) => (
              <Alert
                key={candidate.id}
                severity={assessment.status === "tight" ? "warning" : "info"}
              >
                {candidate.label ?? "Journey option"}: leave{" "}
                {format(candidate.departureAt)}, reach destination{" "}
                {format(candidate.destinationArrivalAt)}. {assessment.label}:{" "}
                {assessment.status === "tight" ? "Tight timing" : "On time"}.{" "}
                {assessment.reason}
              </Alert>
            ))
          ))}
        <Typography variant="body2" color="text.secondary">
          All results are estimates. Arrival windows and confidence scores are
          unavailable until checked against observed stop arrivals.
        </Typography>
      </Stack>
    </Paper>
  );
}
