"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControlLabel,
  IconButton,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import MyLocationRounded from "@mui/icons-material/MyLocationRounded";
import SwapVertRounded from "@mui/icons-material/SwapVertRounded";
import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import { PlaceSearch } from "./place-search";
import type { HomeOrigin } from "./home-journey";
import type { PlaceRef } from "@/lib/personal";
import { rememberLocation } from "@/lib/location";
import { inCampus, locate } from "@/lib/planner/walking";
import { campusDeadline } from "@/lib/transit/deadlines";
const searchPlace = (p: PlaceRef | null) =>
  p ? { ...p, locationLabel: "Campus location" } : null;
function localDeadline(iso?: string | null) {
  if (!iso || !Number.isFinite(Date.parse(iso))) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(Date.parse(iso))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
export function JourneyForm({
  initialFrom = null,
  initialTo = null,
  initialDeadline = null,
  initialGps = false,
  onOrigin,
}: {
  initialFrom?: PlaceRef | null;
  initialTo?: PlaceRef | null;
  initialDeadline?: string | null;
  initialGps?: boolean;
  onOrigin?: (origin: HomeOrigin | null) => void;
}) {
  const router = useRouter(),
    dirty = useRef(false),
    locationRequest = useRef(0);
  const [from, setFrom] = useState(initialFrom),
    [to, setTo] = useState(initialTo),
    [gps, setGps] = useState(initialGps),
    [locating, setLocating] = useState(false),
    [error, setError] = useState("");
  const [mode, setMode] = useState(initialDeadline ? "arrive" : "now"),
    [local, setLocal] = useState(() => localDeadline(initialDeadline)),
    [fold, setFold] = useState<"earlier" | "later" | undefined>();
  const [hydrated, setHydrated] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    queueMicrotask(() => setHydrated(true));
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (dirty.current) return;
    const abort = new AbortController();
    setFrom(initialFrom);
    setTo(initialTo);
    if (
      initialFrom &&
      (onOrigin || initialFrom.name === "Selected campus location")
    ) {
      void locate(initialFrom, abort.signal)
        .then((place) => {
          if (dirty.current || abort.signal.aborted) return;
          setFrom(place);
          onOrigin?.({
            kind: "place",
            place: { ...place, locationLabel: "Default origin" },
          });
        })
        .catch(() => {
          if (!abort.signal.aborted && !dirty.current) onOrigin?.(null);
        });
    }
    if (initialTo?.name === "Selected campus location") {
      void locate(initialTo, abort.signal)
        .then((place) => {
          if (!dirty.current && !abort.signal.aborted) setTo(place);
        })
        .catch(() => {
          if (!abort.signal.aborted && !dirty.current) {
            setTo(null);
            setError(
              "The selected destination is unavailable. Choose another campus location.",
            );
          }
        });
    }
    return () => abort.abort();
  }, [initialFrom, initialTo, onOrigin]);
  const ambiguous =
    !!local && !campusDeadline(local) && !!campusDeadline(local, "earlier");
  function location() {
    const request = ++locationRequest.current;
    if (!navigator.geolocation) {
      setError("Location is unavailable. Choose a building or stop instead.");
      return;
    }
    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (!mounted.current || request !== locationRequest.current) return;
        setLocating(false);
        if (!inCampus(p.coords)) {
          setError(
            "You’re outside the supported Athens campus area. Choose a campus starting point.",
          );
          return;
        }
        dirty.current = true;
        rememberLocation(p.coords.latitude, p.coords.longitude);
        setGps(true);
        setFrom(null);
        onOrigin?.({
          kind: "gps",
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
        });
      },
      (e) => {
        if (!mounted.current || request !== locationRequest.current) return;
        setLocating(false);
        setError(
          e.code === 1
            ? "Location is blocked. You can still choose a building or stop."
            : "We couldn't find your location. Try again or choose a starting point.",
        );
      },
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 10000 },
    );
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if ((!from && !gps) || !to) {
      setError("Choose a starting point and a destination.");
      e.currentTarget
        .querySelector<HTMLInputElement>(
          !from && !gps ? "#journey-from" : "#journey-to",
        )
        ?.focus();
      return;
    }
    const deadline = mode === "arrive" ? campusDeadline(local, fold) : null;
    if (
      mode === "arrive" &&
      (!deadline || Date.parse(deadline) <= Date.now())
    ) {
      setError(
        ambiguous
          ? "Choose the first or second occurrence of this campus time."
          : "Choose a valid future deadline in Athens campus time.",
      );
      e.currentTarget
        .querySelector<HTMLInputElement>("#journey-deadline")
        ?.focus();
      return;
    }
    const params = new URLSearchParams({ to: to.id, toType: to.type });
    if (gps) params.set("fromSource", "current-location");
    else if (from) {
      params.set("from", from.id);
      params.set("fromType", from.type);
    }
    if (deadline) params.set("deadline", deadline);
    router.push(`/plan?${params}`);
  }
  return (
    <Box
      component="form"
      onSubmit={submit}
      noValidate
      aria-label="Plan your journey"
    >
      <Stack
        component="fieldset"
        disabled={!hydrated}
        spacing={2}
        sx={{ m: 0, p: 0, border: 0, minWidth: 0 }}
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "minmax(0,1fr) 48px",
            gap: 0.5,
            alignItems: "center",
          }}
        >
          <Stack spacing={1.5}>
            <PlaceSearch
              label="From"
              inputId="journey-from"
              selectedPlace={searchPlace(from)}
              onSelect={(p) => {
                dirty.current = true;
                locationRequest.current++;
                setLocating(false);
                setFrom(p);
                setGps(false);
                onOrigin?.(p ? { kind: "place", place: p } : null);
              }}
            />
            <PlaceSearch
              label="To"
              inputId="journey-to"
              selectedPlace={searchPlace(to)}
              onSelect={(p) => {
                dirty.current = true;
                setTo(p);
              }}
            />
          </Stack>
          <IconButton
            aria-label="Swap starting point and destination"
            disabled={!from || !to || gps}
            onClick={() => {
              dirty.current = true;
              locationRequest.current++;
              setLocating(false);
              setFrom(to);
              setTo(from);
              if (to)
                onOrigin?.({
                  kind: "place",
                  place: { ...to, locationLabel: "Campus location" },
                });
            }}
          >
            <SwapVertRounded />
          </IconButton>
        </Box>
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            rowGap: 1,
          }}
        >
          <Button
            startIcon={<MyLocationRounded />}
            onClick={location}
            disabled={locating}
            sx={{ px: 0 }}
          >
            {locating ? "Finding you…" : "Use my location"}
          </Button>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={mode}
            onChange={(_, v) => {
              if (v) setMode(v);
            }}
            aria-label="Trip timing"
            sx={{
              alignSelf: "flex-start",
              "& .MuiToggleButton-root": {
                minHeight: 44,
                px: 2,
                textTransform: "none",
                fontWeight: 600,
              },
            }}
          >
            <ToggleButton value="now">Leave now</ToggleButton>
            <ToggleButton value="arrive">Arrive by</ToggleButton>
          </ToggleButtonGroup>
          {gps && (
            <Chip
              label="Current location selected"
              size="small"
              onDelete={() => {
                locationRequest.current++;
                setGps(false);
                onOrigin?.(null);
              }}
            />
          )}
        </Stack>
        {gps && (
          <Typography variant="caption" color="text.secondary">
            Walking directions send your current point to the routing service.
            It is never stored in your saved journeys or route cache.
          </Typography>
        )}
        {mode === "arrive" && (
          <TextField
            id="journey-deadline"
            type="datetime-local"
            label="Arrive by (campus time)"
            value={local}
            onChange={(e) => {
              setLocal(e.target.value);
              setFold(undefined);
            }}
            slotProps={{ inputLabel: { shrink: true } }}
            helperText="Athens campus time"
          />
        )}
        {ambiguous && mode === "arrive" && (
          <RadioGroup
            aria-label="Repeated campus time"
            value={fold ?? ""}
            onChange={(e) => setFold(e.target.value as "earlier" | "later")}
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
        )}
        {error && (
          <Alert severity="warning" role="alert">
            {error}
          </Alert>
        )}
        <Button
          type="submit"
          variant="contained"
          size="large"
          endIcon={<ArrowForwardRounded />}
        >
          Find a trip
        </Button>
      </Stack>
    </Box>
  );
}
