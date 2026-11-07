"use client";
import { useState } from "react";
import Link from "next/link";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Skeleton,
  Snackbar,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import AddRounded from "@mui/icons-material/AddRounded";
import EditRounded from "@mui/icons-material/EditRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import { PlaceSearch } from "@/components/place-search";
import { useMissingBuildings } from "@/lib/use-missing-building";
import { useClasses } from "@/lib/use-classes";
import {
  describeWeekdays,
  validateClass,
  WEEKDAY_NAMES,
  type ClassDraft,
} from "@/lib/classes";
import { planRefHref } from "@/lib/personal";
import type { ClassEntry } from "./next-class";
const initial: ClassDraft = {
  title: "",
  buildingId: "",
  buildingName: "",
  weekdays: [],
  startsAt: "09:30",
  minutesEarly: 10,
  enabled: true,
  reminderEnabled: false,
};
export default function ClassesPage() {
  const data = useClasses();
  const missing = useMissingBuildings(data.classes.map((c) => c.buildingId));
  const [editing, setEditing] = useState<ClassEntry | "new" | null>(null),
    [draft, setDraft] = useState<ClassDraft>(initial),
    [pending, setPending] = useState(false),
    [errors, setErrors] = useState<ReturnType<typeof validateClass>>({});
  const [removing, setRemoving] = useState<ClassEntry | null>(null),
    [undo, setUndo] = useState<ClassDraft | null>(null);
  function open(c: ClassEntry | "new") {
    setEditing(c);
    setDraft(c === "new" ? initial : { ...c });
    setErrors({});
  }
  async function save() {
    const e = validateClass(draft);
    setErrors(e);
    if (Object.keys(e).length) return;
    setPending(true);
    const ok =
      editing === "new"
        ? await data.add(draft)
        : editing
          ? await data.update(editing.id, draft)
          : false;
    setPending(false);
    if (ok) setEditing(null);
  }
  return (
    <Stack spacing={3} sx={{ maxWidth: 1200, mx: "auto" }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", rowGap: 2 }}>
        <Box>
          <Typography component="h1" variant="h1">Classes</Typography>
          <Stack direction="row" spacing={1.5} sx={{ mt: 1 }}>
            <Typography variant="caption" color="text.secondary">Athens time</Typography>
            <Typography variant="caption" color="text.secondary">Saved on this device</Typography>
          </Stack>
        </Box>
        <Button onClick={() => open("new")} startIcon={<AddRounded />} variant="contained" disabled={data.status !== "ready"}>Add a class</Button>
      </Stack>
      {data.saveError && <Alert severity="error">{data.saveError}</Alert>}
      {data.status === "error" && <Alert severity="error" action={<Button onClick={data.reload} color="inherit">Retry</Button>}>Your schedule could not load.</Alert>}
      {data.status === "loading" && <Skeleton variant="rounded" height={220} />}
      {data.status === "ready" && !data.classes.length && <Box sx={{ py: { xs: 4, sm: 6 } }}>
        <Typography component="h2" variant="h2">Add your weekly classes</Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>Choose a building and a weekly meeting time.</Typography>
      </Box>}
      <Box component="section" aria-label="Weekly class schedule" sx={{ borderTop: data.classes.length ? 1 : 0, borderColor: "divider" }}>
        {data.classes.map((c) => <Box component="article" aria-label={`${c.title} class`} key={c.id} sx={{ py: 3, borderBottom: 1, borderColor: "divider", display: "grid", gridTemplateColumns: { xs: "72px minmax(0,1fr)", sm: "88px minmax(0,1fr) auto" }, gap: 2, alignItems: "start" }}>
          <Typography className="transit-number" sx={{ fontSize: "1.5rem", fontWeight: 700, lineHeight: 1.3 }}>{c.startsAt}</Typography>
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h2" variant="h3" sx={{ overflowWrap: "anywhere" }}>{c.title}</Typography>
            <Typography color="text.secondary" variant="body2" sx={{ mt: .5, overflowWrap: "anywhere" }}>{c.buildingName}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{describeWeekdays(c.weekdays)}</Typography>
            <Typography variant="caption" color="text.secondary">Arrive {c.minutesEarly} min early{!c.enabled ? " · Paused" : c.reminderEnabled ? " · In-app reminder" : ""}</Typography>
            {missing.has(c.buildingId) && <Alert severity="warning" sx={{ mt: 1.5 }}>This building is no longer in the campus catalog. Edit this class to choose a current building.</Alert>}
          </Box>
          <Stack direction="row" spacing={1} sx={{ gridColumn: { xs: "1 / -1", sm: "auto" }, justifyContent: "flex-end" }}>
            <Button disabled={missing.has(c.buildingId)} component={Link} href={planRefHref(null, { id: c.buildingId, name: c.buildingName, type: "building" })} variant="outlined">Plan trip</Button>
            <IconButton aria-label={`Edit ${c.title}`} onClick={() => open(c)}><EditRounded fontSize="small" /></IconButton>
            <IconButton aria-label={`Delete ${c.title}`} onClick={() => setRemoving(c)}><DeleteOutlineRounded fontSize="small" /></IconButton>
          </Stack>
        </Box>)}
      </Box>
      <Box component="details">
        <Typography component="summary" variant="body2" color="text.secondary" sx={{ cursor: "pointer", py: 1.5 }}>Schedule and reminder details</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: "60ch" }}>Classes repeat weekly, including holidays. Pause a class when it isn’t meeting. Reminders appear only while ArchRide is open.</Typography>
      </Box>
      <Dialog
        open={editing !== null}
        onClose={() => {
          if (!pending) setEditing(null);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          {editing === "new" ? "Add a class" : "Edit class"}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <TextField
              autoFocus
              label="Class name"
              value={draft.title}
              onChange={(e) =>
                setDraft((d) => ({ ...d, title: e.target.value }))
              }
              error={!!errors.title}
              helperText={errors.title}
              slotProps={{ htmlInput: { maxLength: 80 } }}
            />
            <PlaceSearch
              label="Class building"
              inputId="class-building"
              onSelect={(p) => {
                if (p?.type !== "building") {
                  setErrors((e) => ({
                    ...e,
                    buildingId:
                      "Choose a campus building, not a stop or entrance.",
                  }));
                  return;
                }
                setDraft((d) => ({
                  ...d,
                  buildingId: p.id,
                  buildingName: p.name,
                }));
                setErrors((e) => ({ ...e, buildingId: undefined }));
              }}
            />
            <Typography
              variant="body2"
              color={errors.buildingId ? "error" : "text.secondary"}
            >
              {errors.buildingId ||
                draft.buildingName ||
                "Choose a verified campus building."}
            </Typography>
            <Box>
              <Typography
                id="class-days-label"
                variant="body2"
                sx={{ mb: 1, fontWeight: 600 }}
              >
                Class days
              </Typography>
              <ToggleButtonGroup
                aria-labelledby="class-days-label"
                value={draft.weekdays}
                onChange={(_, v: number[]) =>
                  setDraft((d) => ({ ...d, weekdays: v }))
                }
                sx={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 1,
                  "& .MuiToggleButtonGroup-grouped": {
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: "8px!important",
                    minWidth: 44,
                    minHeight: 48,
                    m: 0,
                  },
                }}
              >
                {WEEKDAY_NAMES.slice(1).map((name, i) => (
                  <ToggleButton key={name} value={i + 1} aria-label={name}>
                    {name.slice(0, 2)}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
              {errors.weekdays && (
                <Typography color="error" variant="caption">
                  {errors.weekdays}
                </Typography>
              )}
            </Box>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label="Start time"
                type="time"
                value={draft.startsAt}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, startsAt: e.target.value }))
                }
                slotProps={{ inputLabel: { shrink: true } }}
                error={!!errors.startsAt}
                helperText={errors.startsAt || "Athens campus time"}
              />
              <TextField
                label="Arrive early (minutes)"
                type="number"
                value={draft.minutesEarly}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    minutesEarly: Number(e.target.value),
                  }))
                }
                slotProps={{ htmlInput: { min: 0, max: 60, step: 1 } }}
                error={!!errors.minutesEarly}
                helperText={errors.minutesEarly}
              />
            </Stack>
            <FormControlLabel
              control={
                <Checkbox
                  checked={draft.enabled}
                  onChange={(_, enabled) =>
                    setDraft((d) => ({ ...d, enabled }))
                  }
                />
              }
              label="Class enabled"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={draft.reminderEnabled}
                  onChange={(_, reminderEnabled) =>
                    setDraft((d) => ({ ...d, reminderEnabled }))
                  }
                />
              }
              label="Remind me before class"
            />
            {data.saveError && <Alert severity="error">{data.saveError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending} variant="contained">
            {pending ? "Saving…" : "Save class"}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={!!removing} onClose={() => setRemoving(null)}>
        <DialogTitle>Delete {removing?.title}?</DialogTitle>
        <DialogContent>
          <Typography>
            Its reminders will stop. You can undo this after deleting.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoving(null)}>Keep class</Button>
          <Button
            color="error"
            onClick={async () => {
              if (!removing) return;
              const { id, ...d } = removing;
              if (await data.remove(id)) {
                setUndo(d);
                setRemoving(null);
              }
            }}
          >
            Delete class
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={!!undo}
        autoHideDuration={8000}
        onClose={() => setUndo(null)}
        message="Class deleted"
        action={
          <Button
            color="inherit"
            onClick={async () => {
              if (undo && (await data.add(undo))) setUndo(null);
            }}
          >
            Undo
          </Button>
        }
      />
    </Stack>
  );
}
