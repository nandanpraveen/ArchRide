"use client";
import React from "react";
import {
  Alert,
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { EmptyState } from "@/components/empty-state";
import AddIcon from "@mui/icons-material/Add";
import dayjs, { Dayjs } from "dayjs";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import { useState } from "react";
import { ClassEntry } from "./next-class";
const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const page = () => {
  const [value, setValue] = React.useState<Dayjs | null>(
    dayjs("2022-04-17T15:30"),
  );
  const initialClasses: ClassEntry[] = [
    {
      id: 0,
      title: "Calculus",
      weekdays: [0, 3],
      startsAt: "9:30" + " PM",
      enabled: true,
    },

    {
      id: 1,
      title: "English",
      weekdays: [0, 3],
      startsAt: "10:30" + " PM",
      enabled: true,
    },

    {
      id: 2,
      title: "Biology",
      weekdays: [0, 3],
      startsAt: "12:30" + " PM",
      enabled: true,
    },
  ];
  const [classes, setClasses] = useState<ClassEntry[]>(initialClasses);

  const columns: GridColDef<(typeof initialClasses)[number]>[] = [
    { field: "id", headerName: "ID", width: 90 },
    {
      field: "title", //field must match an attribute within ClassEntry
      headerName: "Title",
      width: 150,
      editable: true,
      flex: 1,
      align: "center",
      headerAlign: "center",
    },
    {
      field: "weekdays",
      headerName: "Weekday",
      width: 150,
      editable: true,
      flex: 1,
      align: "center",
      headerAlign: "center",
    },
    {
      field: "startsAt",
      headerName: "Starts at",
      type: "number",
      width: 110,
      editable: true,
      flex: 1,
      align: "center",
      headerAlign: "center",
    },
  ];

  return (
    <Stack spacing={3}>
      <Typography component="h1" variant="h1">
        Set up your class schedule here
      </Typography>
      <div className="flex">
        <div className="flex gap-3">
          <TextField>TTT</TextField>
          <FormControl fullWidth>
            <InputLabel id="weekday-select-label">Weekday</InputLabel>
            <Select
              labelId="weekday-select"
              id="weekday-select"
              value={"Weekday"}
              label="Weekday"
              // onChange={handleChange}
            >
              <MenuItem value={"10"}>{weekdays[0]}</MenuItem>
              <MenuItem value={20}>{weekdays[1]}</MenuItem>
              <MenuItem value={30}>{weekdays[2]}</MenuItem>
              <MenuItem value={10}>{weekdays[3]}</MenuItem>
              <MenuItem value={20}>{weekdays[4]}</MenuItem>
            </Select>
          </FormControl>
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <TimePicker
              label="Time"
              // value={value}
              // onChange={(newValue) => setValue(newValue)}
            />
          </LocalizationProvider>
        </div>
        <Button>
          <AddIcon />
        </Button>
      </div>

      <DataGrid
        rows={classes}
        columns={columns}
        pageSize={5}
        initialState={{
          columns: {
            columnVisibilityModel: {
              id: false,
            },
          },
        }}
        disableSelectionOnClick
      />
      <EmptyState
        title="Trip recommendations are not available yet"
        description="Planning needs verified walking paths and usable transit arrivals. Your selected places are shown above; no journey times or bus recommendations are being estimated."
        action="Explore the map"
        href="/map"
      />
    </Stack>
  );
};

export default page;
