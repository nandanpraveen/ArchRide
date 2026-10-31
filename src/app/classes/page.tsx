"use client";
import Link from "next/link";
import { useState } from "react";
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import dayjs, { Dayjs } from "dayjs";
import EditLocationIcon from "@mui/icons-material/EditLocationAltOutlined";
import { useMissingBuildings } from "@/lib/use-missing-building";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import {
  DataGrid,
  GridActionsCellItem,
  type GridColDef,
} from "@mui/x-data-grid";
import { PlaceSearch } from "@/components/place-search";
import type { Place } from "@/lib/campus-data";
import {
  describeWeekdays,
  isValidMinutesEarly,
  isValidStartTime,
  MAX_MINUTES_EARLY,
  validateClass,
  WEEKDAY_NAMES,
  type ClassDraft,
  type ClassErrors,
} from "@/lib/classes";
import { useClasses } from "@/lib/use-classes";
import type { ClassEntry } from "./next-class";

const defaultTime = () => dayjs().hour(9).minute(30);

const Page = () => {
  const {
    classes,
    status,
    source,
    accountUnavailable,
    saveError,
    add,
    update,
    remove,
    reload,
  } = useClasses();
  const [title, setTitle] = useState("");
  const [building, setBuilding] = useState<Place | null>(null);
  const [weekday, setWeekday] = useState<number[]>([]);
  const [time, setTime] = useState<Dayjs | null>(defaultTime);
  const [minutesEarly, setMinutesEarly] = useState("10");
  const [errors, setErrors] = useState<ClassErrors>({});
  const [formKey, setFormKey] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<ClassEntry | null>(null);
  const [undo, setUndo] = useState<ClassDraft | null>(null);
  const [changing, setChanging] = useState<ClassEntry | null>(null);
  const [newPlace, setNewPlace] = useState<Place | null>(null);
  const newBuilding = newPlace?.type === "building" ? newPlace : null;
  const missing = useMissingBuildings(classes.map((item) => item.buildingId));

  // With `multiple`, MUI types the value as number[] or a comma-separated string.
  const handleWeekdayChange = (value: string | number[]) => {
    setWeekday(
      typeof value === "string" ? value.split(",").map(Number) : value,
    );
  };

  const handleBuilding = (place: Place | null) => {
    if (place && place.type !== "building") {
      setBuilding(null);
      setErrors((current) => ({
        ...current,
        buildingId: "Choose a campus building, not a stop or entrance.",
      }));
      return;
    }
    setBuilding(place);
    setErrors((current) => ({ ...current, buildingId: undefined }));
  };

  async function handleAdd() {
    const draft: ClassDraft = {
      title,
      weekdays: weekday,
      startsAt: time && time.isValid() ? time.format("HH:mm") : "",
      enabled: true,
      buildingId: building?.id ?? "",
      buildingName: building?.name ?? "",
      minutesEarly:
        minutesEarly.trim() === "" ? Number.NaN : Number(minutesEarly),
      reminderEnabled: false,
    };
    const found = validateClass(draft);
    setErrors(found);
    if (Object.keys(found).length) return;
    if (await add(draft)) {
      setTitle("");
      setBuilding(null);
      setWeekday([]);
      setTime(defaultTime());
      setMinutesEarly("10");
      setFormKey((value) => value + 1);
    }
  }
  function closeChange() {
    setChanging(null);
    setNewPlace(null);
  }

  async function saveBuilding() {
    if (!changing || !newBuilding) return;
    const { id, ...draft } = changing;
    const saved = await update(id, {
      ...draft,
      buildingId: newBuilding.id,
      buildingName: newBuilding.name,
    });
    if (saved) closeChange();
  }
  async function confirmDelete() {
    if (!pendingDelete) return;
    const { id, ...draft } = pendingDelete;
    setPendingDelete(null);
    if (await remove(id)) setUndo(draft);
  }

  async function undoDelete() {
    if (undo) await add(undo);
    setUndo(null);
  }

  async function processRowUpdate(newRow: ClassEntry) {
    const { id, ...draft } = newRow;
    if (!(await update(id, draft))) throw new Error("Class was not saved.");
    return newRow;
  }

  const columns: GridColDef<ClassEntry>[] = [
    {
      field: "title",
      headerName: "Class",
      minWidth: 140,
      flex: 1,
      editable: true,
    },
    {
      field: "buildingName",
      headerName: "Building",
      minWidth: 220,
      flex: 1,
      renderCell: ({ row }) => (
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: "center", minWidth: 0 }}
        >
          <Typography variant="body2" noWrap>
            {row.buildingName || "Building not set"}
          </Typography>
          {missing.has(row.buildingId) && (
            <Chip size="small" color="warning" label="Unavailable" />
          )}
        </Stack>
      ),
    },
    {
      field: "weekdays",
      headerName: "Days",
      minWidth: 150,
      flex: 1,
      valueFormatter: (value: number[]) => describeWeekdays(value),
    },
    {
      field: "startsAt",
      headerName: "Starts (HH:mm)",
      minWidth: 120,
      editable: true,
      preProcessEditCellProps: (params) => ({
        ...params.props,
        error: !isValidStartTime(params.props.value),
      }),
    },
    {
      field: "minutesEarly",
      headerName: "Early (min)",
      type: "number",
      minWidth: 110,
      editable: true,
      preProcessEditCellProps: (params) => ({
        ...params.props,
        error: !isValidMinutesEarly(params.props.value),
      }),
    },
    {
      field: "enabled",
      headerName: "On",
      type: "boolean",
      width: 80,
      editable: true,
    },
    {
      field: "reminderEnabled",
      headerName: "Reminder",
      type: "boolean",
      width: 100,
      editable: true,
    },
    {
      field: "actions",
      type: "actions",
      headerName: "Actions",
      width: 120,
      getActions: ({ row }) => [
        <GridActionsCellItem
          key="change-building"
          icon={<EditLocationIcon />}
          label={`Change building for ${row.title}`}
          onClick={() => setChanging(row)}
        />,
        <GridActionsCellItem
          key="delete"
          icon={<DeleteIcon />}
          label={`Delete ${row.title}`}
          onClick={() => setPendingDelete(row)}
        />,
      ],
    },
  ];

  return (
    <Stack spacing={3}>
      <Typography component="h1" variant="h1">
        Class schedule
      </Typography>
      <Typography color="text.secondary" sx={{ maxWidth: "60ch" }}>
        Times are campus time (Eastern), whatever timezone your phone is in.
        Home shows your next class.
      </Typography>

      {accountUnavailable && (
        <Alert severity="warning">
          Account services are unavailable, so your schedule is stored on this
          device only for now.
        </Alert>
      )}
      {status === "ready" && source === "device" && !accountUnavailable && (
        <Alert
          severity="info"
          action={
            <Button
              component={Link}
              href="/sign-in"
              color="inherit"
              size="small"
            >
              Sign in
            </Button>
          }
        >
          You are using a guest schedule. It stays on this device only. Sign in
          to sync it privately to your account.
        </Alert>
      )}
      {status === "ready" && source === "account" && (
        <Typography variant="body2" color="text.secondary">
          Your schedule syncs to your account. Only you can see it.
        </Typography>
      )}

      <Stack component="section" aria-label="Add a class" spacing={2}>
        <Stack
          direction="row"
          useFlexGap
          sx={{ flexWrap: "wrap", gap: 2, alignItems: "flex-start" }}
        >
          <TextField
            label="Class name"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            error={!!errors.title}
            helperText={errors.title}
            sx={{ minWidth: 200 }}
          />
          <Stack sx={{ minWidth: 240, flex: "1 1 240px" }}>
            <PlaceSearch
              key={formKey}
              label="Building"
              inputId="class-building"
              onSelect={handleBuilding}
            />
            {errors.buildingId && (
              <FormHelperText error>{errors.buildingId}</FormHelperText>
            )}
          </Stack>
          <FormControl error={!!errors.weekdays} sx={{ minWidth: 200 }}>
            <InputLabel id="weekday-select-label">Weekdays</InputLabel>
            <Select
              multiple
              labelId="weekday-select-label"
              id="weekday-select"
              value={weekday}
              onChange={(e) => handleWeekdayChange(e.target.value)}
              label="Weekdays"
              renderValue={(selected) => describeWeekdays(selected)}
            >
              {WEEKDAY_NAMES.slice(1).map((name, index) => (
                <MenuItem key={name} value={index + 1}>
                  {name}
                </MenuItem>
              ))}
            </Select>
            {errors.weekdays && (
              <FormHelperText>{errors.weekdays}</FormHelperText>
            )}
          </FormControl>
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <TimePicker
              label="Starts at"
              value={time}
              onChange={(newValue) => setTime(newValue)}
              slotProps={{
                textField: {
                  error: !!errors.startsAt,
                  helperText: errors.startsAt,
                  sx: { width: 160 },
                },
              }}
            />
          </LocalizationProvider>
          <TextField
            label="Arrive early (min)"
            type="number"
            value={minutesEarly}
            onChange={(e) => setMinutesEarly(e.target.value)}
            error={!!errors.minutesEarly}
            helperText={errors.minutesEarly}
            slotProps={{
              htmlInput: { min: 0, max: MAX_MINUTES_EARLY, step: 1 },
            }}
            sx={{ width: 170 }}
          />
        </Stack>
        <Button
          variant="contained"
          disabled={status !== "ready"}
          startIcon={<AddIcon />}
          onClick={handleAdd}
          sx={{ alignSelf: "flex-start" }}
        >
          Add class
        </Button>
      </Stack>

      {saveError && (
        <Alert severity="error" role="alert">
          {saveError}
        </Alert>
      )}

      {status === "loading" && (
        <Stack
          direction="row"
          spacing={2}
          role="status"
          sx={{ alignItems: "center" }}
        >
          <CircularProgress size={24} />
          <Typography>Loading your schedule…</Typography>
        </Stack>
      )}
      {status === "error" && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={reload}>
              Try again
            </Button>
          }
        >
          Your schedule could not be loaded. Check your connection and try
          again.
        </Alert>
      )}
      {status === "ready" && classes.length === 0 && (
        <Typography color="text.secondary">
          No classes yet. Add your first class above.
        </Typography>
      )}
      {status === "ready" &&
        classes.some((item) => missing.has(item.buildingId)) && (
          <Alert severity="warning">
            A building on your schedule is no longer in campus data. Use Change
            building on the classes marked Unavailable.
          </Alert>
        )}
      {status === "ready" && classes.length > 0 && (
        <DataGrid
          aria-label="Weekly class schedule"
          disableVirtualization
          rows={classes}
          columns={columns}
          autoHeight
          processRowUpdate={processRowUpdate}
          onProcessRowUpdateError={() => {}}
          initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
          pageSizeOptions={[10, 25]}
          disableRowSelectionOnClick
        />
      )}

      <Dialog open={!!changing} onClose={closeChange} fullWidth maxWidth="sm">
        <DialogTitle>Change building</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {changing?.title} is set to{" "}
            {changing?.buildingName || "no building"}. Pick the building it
            meets in now.
          </DialogContentText>
          <PlaceSearch
            label="New building"
            inputId="class-new-building"
            onSelect={setNewPlace}
          />
          {newPlace && !newBuilding && (
            <FormHelperText error>
              Choose a campus building, not a stop or entrance.
            </FormHelperText>
          )}
          {saveError && (
            <Alert severity="error" role="alert" sx={{ mt: 2 }}>
              {saveError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeChange}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!newBuilding}
            onClick={saveBuilding}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={!!pendingDelete} onClose={() => setPendingDelete(null)}>
        <DialogTitle>Delete this class?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {pendingDelete?.title} will be removed from your schedule. You can
            undo right after.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingDelete(null)}>Cancel</Button>
          <Button color="error" onClick={confirmDelete}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={!!undo}
        autoHideDuration={8000}
        onClose={() => setUndo(null)}
        message="Class deleted"
        action={
          <Button color="inherit" size="small" onClick={undoDelete}>
            Undo
          </Button>
        }
      />
    </Stack>
  );
};

export default Page;
