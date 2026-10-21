"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Autocomplete, Box, TextField, Typography } from "@mui/material";
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

  function handleInput(value: string) {
    setInput(value);
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
  }, [input]);

  const emptyText =
    status === "loading"
      ? "Searching…"
      : status === "unavailable"
        ? "Campus location data is not connected yet, so search is unavailable."
        : status === "error"
          ? "Search failed. Change your search to try again."
          : status === "ok"
            ? "No matching buildings or stops. Try another spelling."
            : "Type a building, entrance, or stop name.";

  return (
    <Autocomplete
      options={options}
      filterOptions={(x) => x}
      inputValue={input}
      onInputChange={(_, value) => handleInput(value)}
      getOptionLabel={(option) => option.name}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      loading={status === "loading"}
      noOptionsText={emptyText}
      onChange={(_, place) => {
        if (place) router.push(`/plan?to=${encodeURIComponent(place.id)}`);
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
  );
}