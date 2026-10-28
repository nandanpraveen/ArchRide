"use client";

import { useMemo, useState } from "react";
import {
  Alert,
  Card,
  CardContent,
  Chip,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { compareTrip, type Recommendation } from "@/lib/planner/planner";
import { BUILDINGS, STOPS } from "@/lib/planner/fixtures";

const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  walk: "Walking looks faster",
  bus: "The bus looks faster",
  similar: "About the same time",
};

export default function PlanPage() {
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");

  const from = BUILDINGS.find((b) => b.id === fromId);
  const to = BUILDINGS.find((b) => b.id === toId);
  const sameBuilding = Boolean(from && to && from.id === to.id);

  const result = useMemo(
    () => (from && to && !sameBuilding ? compareTrip(from, to, STOPS) : null),
    [from, to, sameBuilding],
  );

  return (
    <Stack spacing={3}>
      <Typography component="h1" variant="h1">
        Plan a trip
      </Typography>

      <Stack spacing={2}>
        <TextField select label="From" value={fromId} onChange={(e) => setFromId(e.target.value)}>
          {BUILDINGS.map((b) => (
            <MenuItem key={b.id} value={b.id}>
              {b.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField select label="To" value={toId} onChange={(e) => setToId(e.target.value)}>
          {BUILDINGS.map((b) => (
            <MenuItem key={b.id} value={b.id}>
              {b.name}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {sameBuilding && <Alert severity="info">Pick two different buildings to compare.</Alert>}

      {!from || !to ? (
        <Typography color="text.secondary">
          Choose a starting building and a destination to compare walking and the bus.
        </Typography>
      ) : null}

      {result && (
        <Stack spacing={2}>
          <Chip
            label={`${RECOMMENDATION_LABEL[result.recommendation]}${
              result.recommendation !== "similar" && result.bus
                ? ` by about ${result.differenceMin} min`
                : ""
            }`}
            color="primary"
            sx={{ alignSelf: "flex-start", minHeight: 40 }}
          />

          <Card variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent>
              <Typography variant="h6" component="h2">
                Walk: about {result.walk.minutes} min
              </Typography>
              <Typography variant="body2" color="text.secondary">
                About {result.walk.meters} m on foot
              </Typography>
            </CardContent>
          </Card>

          <Card variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent>
              {result.bus ? (
                <>
                  <Typography variant="h6" component="h2">
                    Bus: about {result.bus.minutes} min
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Walk {Math.round(result.bus.walkToStopMin)} min to {result.bus.boardStop.name},
                    wait about {Math.round(result.bus.waitMin)} min for the {result.bus.routeName},
                    ride about {Math.round(result.bus.rideMin)} min to {result.bus.alightStop.name},
                    then walk {Math.round(result.bus.walkFromStopMin)} min.
                  </Typography>
                </>
              ) : (
                <>
                  <Typography variant="h6" component="h2">
                    Bus: unavailable
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    No direct bus option was found between these buildings.
                  </Typography>
                </>
              )}
            </CardContent>
          </Card>

          <Typography variant="caption" color="text.secondary">
            Estimates use assumed walking and bus speeds and an assumed bus frequency. Live
            arrivals are not connected yet.
          </Typography>
        </Stack>
      )}
    </Stack>
  );
}
