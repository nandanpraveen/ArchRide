"use client";
import React, { useEffect } from "react";
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
import getNextOccurrence, { ClassEntry } from "./next-class";
import { DateTime } from "ts-luxon";
const weekdays = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]

const initialClasses: ClassEntry[] = [

  {
    id: 0,
    title: "Calculus",
  weekdays: [1,3],
    startsAt: "9:30",
    enabled: true,
  },

  {
    id: 1,
    title: "English",
    weekdays: [1,3],
    startsAt: "10:30" ,
    enabled: true,
  },

  {
    id: 2,
    title: "Biology",
 weekdays: [1,3],
    startsAt: "12:30" ,
    enabled: true,
  },
];

const defaultTime = new Date();
defaultTime.setHours(9);
defaultTime.setMinutes(30);
const Page = () => {
  const [value, setValue] = React.useState<Dayjs | null>(
    dayjs("2022-04-17T15:30"),
  );
  const [classes, setClasses] = useState<ClassEntry[]>(initialClasses);
  const [weekday, setWeekday] = useState(1);

  
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
useEffect(()=>{

    getNextOccurrence(initialClasses, DateTime.now());
    console.log("NEXT")
  },[])
  return (
    <Stack spacing={3}>
      <Typography component="h1" variant="h1">
        Set up your class schedule here
      </Typography>
      <div className="flex">
        <div className="flex gap-3">
          <TextField label="Class name">TTT</TextField>
          <FormControl fullWidth>
            <InputLabel id="weekday-select-label">Weekday</InputLabel>
            <Select
              labelId="weekday-select-label"
              id="weekday-select-label"
              value={weekday}
              defaultValue={1}
              onChange={(e)=>{setWeekday(e.target.value); }}
              label="Weekday"
              // onChange={handleChange}
            >
              <MenuItem value={1}>{weekdays[1]}</MenuItem>
              <MenuItem value={2}>{weekdays[2]}</MenuItem>
              <MenuItem value={3}>{weekdays[3]}</MenuItem>
              <MenuItem value={4}>{weekdays[4]}</MenuItem>
              <MenuItem value={5}>{weekdays[5]}</MenuItem>
            </Select>
          </FormControl>
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <TimePicker
              label="Time"
               //value={value}
                 defaultValue={dayjs(defaultTime)}
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

export default Page;
