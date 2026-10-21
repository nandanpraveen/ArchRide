"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Autocomplete, Box, Button, TextField, Typography } from "@mui/material";
import { searchPlaces, type Place } from "@/lib/campus-data";

type Status = "idle" | "loading" | "ok" | "unavailable" | "error";

const typeLabel: Record<Place["type"], string> = {
  building: "Building",
  entrance: "Entrance",
  stop: "Bus stop",
};

export function PlaceSearch() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [options, setOptions] = useState<Place[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [reason, setReason] = useState("");
  const [revision, setRevision] = useState(0);

  function handleInput(value: string) {
    setInput(value);
    setOptions([]);
    if (value.trim()) {
      setStatus("loading");
    } else {
      setOptions([]);
      setStatus("idle");
    }
  }

  useEffect(() => {
    const query = input.trim().replace(/\s+/g, " ");
    if (!query) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchPlaces(query, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return;
          if (result.status === "ok") {
            setOptions(result.places);
            setStatus("ok");
          } else {
            setOptions([]);
            setStatus("unavailable");
            setReason(result.reason);
          }
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setOptions([]);
          setStatus("error");
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [input, revision]);

  const emptyText =
    status === "loading"
      ? "Searching…"
      : status === "unavailable"
        ? reason
        : status === "error"
          ? "Search failed. Change your search to try again."
          : status === "ok"
            ? "No matching buildings or stops. Try another spelling."
            : "Type a building, entrance, or stop name.";

  return (
    <Box>
    <Autocomplete
      id="campus-place-search"
      options={options}
      filterOptions={(x) => x}
      inputValue={input}
      onInputChange={(_, value) => handleInput(value)}
      getOptionLabel={(option) => option.name}
      getOptionKey={(option) => `${option.type}:${option.id}`}
      isOptionEqualToValue={(a, b) => a.id === b.id && a.type === b.type}
      loading={status === "loading"}
      noOptionsText={<Box>{emptyText}{(status === "unavailable" || status === "error") && <Button onMouseDown={(event) => event.preventDefault()} onClick={() => { setStatus("loading"); setRevision((value) => value + 1); }}>Retry search</Button>}</Box>}
      onChange={(_, place) => {
        if (place) router.push(place.type === "stop"
          ? `/map?stop=${encodeURIComponent(place.id)}`
          : `/map?place=${encodeURIComponent(place.id)}&type=${place.type}`);
      }}
      renderOption={(props, option) => {
        const { key, ...rest } = props;
        return (
          <li key={key} {...rest} style={{ minHeight: 48 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ overflowWrap: "anywhere" }}>
                {option.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {typeLabel[option.type]} · {option.locationLabel}
              </Typography>
            </Box>
          </li>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Search buildings and stops"
          placeholder="Where are you going?"
        />
      )}
    />
    </Box>
  );
}
