"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Autocomplete,
  Box,
  Button,
  TextField,
  Typography,
} from "@mui/material";
import { searchPlaces, type Place } from "@/lib/campus-data";
import DirectionsBusRounded from "@mui/icons-material/DirectionsBusRounded";
import PlaceOutlined from "@mui/icons-material/PlaceOutlined";

type Status = "idle" | "loading" | "ok" | "unavailable" | "error";

const typeLabel: Record<Place["type"], string> = {
  building: "Building",
  entrance: "Entrance",
  stop: "Bus stop",
};

export function PlaceSearch({
  label = "Search buildings and stops",
  inputId = "campus-place-search",
  onSelect,
  selectedPlace,
}: {
  label?: string;
  inputId?: string;
  onSelect?: (place: Place | null) => void;
  selectedPlace?: Place | null;
}) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [options, setOptions] = useState<Place[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [reason, setReason] = useState("");
  const [warning, setWarning] = useState("");
  const [revision, setRevision] = useState(0);
  const editing = useRef(false);

  function handleInput(value: string) {
    setInput(value);
    setWarning("");
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
            setWarning(result.warning ?? "");
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
        id={inputId}
        options={options}
        value={selectedPlace}
        filterOptions={(x) => x}
        inputValue={input}
        onInputChange={(_, value, reason) => {
          // Clearing the selected ID while typing must not erase the new query.
          if (reason === "reset" && editing.current) return;
          editing.current = reason === "input";
          handleInput(value);
          if (reason === "input") onSelect?.(null);
        }}
        getOptionLabel={(option) => option.name}
        getOptionKey={(option) => `${option.type}:${option.id}`}
        isOptionEqualToValue={(a, b) => a.id === b.id && a.type === b.type}
        loading={status === "loading"}
        openOnFocus
        slotProps={{
          paper: { sx: { mt: 0.75, border: 1, borderColor: "divider", boxShadow: 3 } },
          listbox: { sx: { py: 0.5, "& .MuiAutocomplete-option": { gap: 1.5, py: 1.25 } } },
        }}
        noOptionsText={
          <Box>
            {emptyText}
            {(status === "unavailable" || status === "error") && (
              <Button
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setStatus("loading");
                  setRevision((value) => value + 1);
                }}
              >
                Retry search
              </Button>
            )}
          </Box>
        }
        onChange={(_, place) => {
          editing.current = false;
          handleInput(place?.name ?? "");
          if (onSelect) onSelect(place);
          else if (place)
            router.push(
              place.type === "stop"
                ? `/map?stop=${encodeURIComponent(place.id)}`
                : `/map?place=${encodeURIComponent(place.id)}&type=${place.type}`,
            );
        }}
        renderOption={(props, option) => {
          const { key, ...rest } = props;
          return (
            <li key={key} {...rest} style={{ minHeight: 64 }}>
              <Box sx={{ display: "grid", placeItems: "center", width: 36, height: 36, flexShrink: 0, borderRadius: "8px", bgcolor: "action.hover", color: "text.secondary" }}>
                {option.type === "stop" ? <DirectionsBusRounded fontSize="small" /> : <PlaceOutlined fontSize="small" />}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ overflowWrap: "anywhere", fontWeight: 600 }}>
                  {option.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {typeLabel[option.type]}
                  {options.filter(
                    (place) =>
                      place.name === option.name && place.type === option.type,
                  ).length > 1
                    ? ` · ${option.locationLabel}`
                    : ""}
                </Typography>
              </Box>
            </li>
          );
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            label={label}
            placeholder="Search a building or stop"
            helperText={warning || undefined}
          />
        )}
      />
    </Box>
  );
}
