"use client";
import { useState } from "react";
import {
  Button,
  IconButton,
  List,
  ListItem,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ArrowUpwardRounded from "@mui/icons-material/ArrowUpwardRounded";
import ArrowDownwardRounded from "@mui/icons-material/ArrowDownwardRounded";
import DeleteRounded from "@mui/icons-material/DeleteRounded";
import EditRounded from "@mui/icons-material/EditRounded";
import { EmptyState } from "@/components/empty-state";
import { useSavedStops } from "@/lib/use-saved-stops";
import {
  MAX_NAME_LENGTH,
  moveStop,
  renameStop,
  replaceSavedStops,
  unsaveStop,
  type SavedStop,
} from "@/lib/saved";

type Undo = { previous: SavedStop[]; name: string };

export default function SavedPage() {
  const stops = useSavedStops();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<Undo | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function startEdit(stop: SavedStop) {
    setEditingId(stop.id);
    setDraft(stop.name);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setError(null);
  }

  function submitEdit() {
    if (!editingId) return;
    const result = renameStop(editingId, draft);
    if (result.ok) {
      cancelEdit();
      return;
    }
    setError(
      result.reason === "blank"
        ? "Enter a name."
        : result.reason === "too-long"
          ? `Use ${MAX_NAME_LENGTH} characters or fewer.`
          : "Couldn't save on this device. Storage may be full or blocked.",
    );
  }

  function remove(stop: SavedStop) {
    const previous = stops;
    const result = unsaveStop(stop.id);
    if (result.ok) {
      setUndo({ previous, name: stop.name });
    } else {
      setNotice("Couldn't remove it. Storage may be full or blocked.");
    }
  }

  function undoRemove() {
    if (!undo) return;
    const result = replaceSavedStops(undo.previous);
    setUndo(null);
    if (!result.ok) setNotice("Couldn't restore it. Storage may be blocked.");
  }

  return (
    <Stack spacing={3}>
      <Typography component="h1" variant="h1">
        Saved journeys
      </Typography>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ maxWidth: "65ch" }}
      >
        You&apos;re not signed in, so saved items stay on this device only.
      </Typography>

      <Stack
        component="section"
        spacing={1}
        aria-labelledby="favorite-stops-heading"
      >
        <Typography component="h2" variant="h2" id="favorite-stops-heading">
          Favorite stops
        </Typography>
        {stops.length === 0 ? (
          <EmptyState
            title="Keep your usual trips close"
            description="Your favorite stops and named journeys will live here. Saved journeys will always use fresh recommendations when opened."
          />
        ) : (
          <List disablePadding>
            {stops.map((stop, index) => (
              <ListItem
                key={stop.id}
                divider
                sx={{ gap: 1, flexWrap: "wrap", py: 1.5 }}
              >
                {editingId === stop.id ? (
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1}
                    sx={{ width: "100%", alignItems: { sm: "flex-start" } }}
                  >
                    <TextField
                      label="Stop name"
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") submitEdit();
                        if (event.key === "Escape") cancelEdit();
                      }}
                      error={error !== null}
                      helperText={error ?? " "}
                      autoFocus
                    />
                    <Button variant="contained" onClick={submitEdit}>
                      Save name
                    </Button>
                    <Button onClick={cancelEdit}>Cancel</Button>
                  </Stack>
                ) : (
                  <>
                    <Typography
                      sx={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}
                    >
                      {stop.name}
                    </Typography>
                    <Stack direction="row">
                      <IconButton
                        aria-label={`Move ${stop.name} up`}
                        disabled={index === 0}
                        onClick={() => moveStop(stop.id, -1)}
                      >
                        <ArrowUpwardRounded />
                      </IconButton>
                      <IconButton
                        aria-label={`Move ${stop.name} down`}
                        disabled={index === stops.length - 1}
                        onClick={() => moveStop(stop.id, 1)}
                      >
                        <ArrowDownwardRounded />
                      </IconButton>
                      <IconButton
                        aria-label={`Rename ${stop.name}`}
                        onClick={() => startEdit(stop)}
                      >
                        <EditRounded />
                      </IconButton>
                      <IconButton
                        aria-label={`Remove ${stop.name}`}
                        onClick={() => remove(stop)}
                      >
                        <DeleteRounded />
                      </IconButton>
                    </Stack>
                  </>
                )}
              </ListItem>
            ))}
          </List>
        )}
      </Stack>

      <Stack
        component="section"
        spacing={1}
        aria-labelledby="named-journeys-heading"
      >
        <Typography component="h2" variant="h2" id="named-journeys-heading">
          Named journeys
        </Typography>
        <Typography color="text.secondary" sx={{ maxWidth: "60ch" }}>
          Saved journeys will appear here once trip planning is connected. They
          will always be planned again with current information when opened.
        </Typography>
      </Stack>

      <Snackbar
        open={undo !== null}
        autoHideDuration={8000}
        onClose={(_, reason) => {
          if (reason !== "clickaway") setUndo(null);
        }}
        message={undo ? `Removed ${undo.name}` : ""}
        action={
          <Button color="inherit" onClick={undoRemove}>
            Undo
          </Button>
        }
      />
      <Snackbar
        open={notice !== null}
        autoHideDuration={6000}
        onClose={() => setNotice(null)}
        message={notice ?? ""}
      />
    </Stack>
  );
}