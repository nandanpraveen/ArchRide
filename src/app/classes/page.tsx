"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import {
  Alert, Button, Checkbox, FormControlLabel, FormGroup, Paper, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import getNextOccurrence, { type ClassEntry } from "./next-class";

const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export default function ClassesPage() {
  const ready = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const [classes, setClasses] = useState<ClassEntry[]>([]);
  const [title, setTitle] = useState("");
  const [days, setDays] = useState<number[]>([]);
  const [startsAt, setStartsAt] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const titleInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const next = getNextOccurrence(classes, now);

  function clearDraft() {
    setTitle(""); setDays([]); setStartsAt(""); setEditingId(null); setError(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || title.trim().length > 80 || !days.length
      || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startsAt)) {
      setError("Enter a class name of 1–80 characters, choose at least one weekday, and enter a valid start time.");
      titleInput.current?.focus();
      return;
    }
    setClasses((current) => editingId === null
      ? [...current, { id: Math.max(-1, ...current.map((entry) => entry.id)) + 1, title: title.trim(), weekdays: days, startsAt, enabled: true }]
      : current.map((entry) => entry.id === editingId ? { ...entry, title: title.trim(), weekdays: days, startsAt } : entry));
    clearDraft();
  }

  function edit(entry: ClassEntry) {
    setEditingId(entry.id); setTitle(entry.title); setDays(entry.weekdays); setStartsAt(entry.startsAt); setError(null);
    titleInput.current?.focus();
  }

  return <Stack spacing={3}>
    <Typography component="h1" variant="h1">Classes</Typography>
    <Alert severity="info">This draft schedule lasts until you reload or leave this page. Schedule saving, reminders, and trips to class are not connected yet. All class times use America/New_York.</Alert>
    <Paper component="form" onSubmit={submit} noValidate variant="outlined" sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Typography component="h2" variant="h2">{editingId === null ? "Add a class" : "Edit class"}</Typography>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField label="Class name" disabled={!ready} inputRef={titleInput} value={title} onChange={(event) => setTitle(event.target.value)} required slotProps={{ htmlInput: { maxLength: 80 } }} />
        <Stack component="fieldset" sx={{ border: 0, p: 0, m: 0 }}>
          <Typography component="legend">Class weekdays</Typography>
          <FormGroup row>
            {weekdays.map((day, index) => <FormControlLabel key={day} label={day} control={<Checkbox disabled={!ready} checked={days.includes(index)} onChange={(_, checked) => setDays((current) => checked ? [...current, index] : current.filter((value) => value !== index))} />} />)}
          </FormGroup>
        </Stack>
        <TextField label="Start time" disabled={!ready} type="time" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 60 } }} />
        <Stack direction="row" spacing={1}>
          <Button type="submit" disabled={!ready} variant="contained">{editingId === null ? "Add class" : "Save class"}</Button>
          {editingId !== null && <Button onClick={clearDraft}>Cancel edit</Button>}
        </Stack>
      </Stack>
    </Paper>
    <Typography role="status">{next
      ? `Next class: ${next.classEntry.title} · ${new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(Date.parse(next.startTime))}`
      : "No upcoming classes in this draft schedule."}</Typography>
    {classes.length ? <TableContainer component={Paper} variant="outlined">
      <Table aria-label="Class schedule">
        <TableHead><TableRow><TableCell>Class</TableCell><TableCell>Weekdays</TableCell><TableCell>Starts at (campus time)</TableCell><TableCell>Actions</TableCell></TableRow></TableHead>
        <TableBody>{classes.map((entry) => <TableRow key={entry.id}>
          <TableCell component="th" scope="row" sx={{ overflowWrap: "anywhere" }}>{entry.title}</TableCell>
          <TableCell>{[...entry.weekdays].sort().map((day) => weekdays[day]).join(", ")}</TableCell>
          <TableCell>{entry.startsAt}</TableCell>
          <TableCell><Stack spacing={1}>
            <Button aria-label={`Edit ${entry.title}`} onClick={() => edit(entry)}>Edit</Button>
            <Button aria-label={`${entry.enabled ? "Disable" : "Enable"} ${entry.title}`} aria-pressed={entry.enabled} onClick={() => setClasses((current) => current.map((item) => item.id === entry.id ? { ...item, enabled: !item.enabled } : item))}>{entry.enabled ? "Enabled" : "Disabled"}</Button>
            <Button aria-label={`Remove ${entry.title}`} onClick={() => {
              setClasses((current) => current.filter((item) => item.id !== entry.id));
              if (editingId === entry.id) clearDraft();
            }}>Remove</Button>
          </Stack></TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </TableContainer> : <Typography color="text.secondary">Add a class to preview your weekly schedule.</Typography>}
  </Stack>;
}
