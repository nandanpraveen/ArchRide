"use client";
import Link from "next/link";
import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Skeleton,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ArrowUpwardRounded from "@mui/icons-material/ArrowUpwardRounded";
import ArrowDownwardRounded from "@mui/icons-material/ArrowDownwardRounded";
import EditRounded from "@mui/icons-material/EditRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import BookmarkBorderRounded from "@mui/icons-material/BookmarkBorderRounded";
import { usePersonal } from "@/components/personal-provider";
import { planRefHref, type SavedItem } from "@/lib/personal";
import { usePublicTransit } from "@/lib/transit/public-data";
export default function SavedPage() {
  const data = usePersonal(),
    transit = usePublicTransit();
  const [editing, setEditing] = useState<SavedItem | null>(null),
    [name, setName] = useState(""),
    [undo, setUndo] = useState<SavedItem | null>(null);
  const groups = [{ kind: "journey", title: "Journeys" }, { kind: "stop", title: "Stops" }];
  return (
    <Stack spacing={4} sx={{ maxWidth: 1080 }}>
      <Box>
        <Typography component="h1" variant="h1">Saved</Typography>
        <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>Your journeys and stops stay on this device.</Typography>
      </Box>
      {data.error && <Alert severity="error" action={<Button onClick={data.reload} color="inherit">Retry</Button>}>{data.error}</Alert>}
      {!data.ready && !data.error && <Stack spacing={2}>{[0, 1, 2].map((key) => <Skeleton key={key} variant="rounded" height={72} />)}</Stack>}
      {data.ready && !data.items.length && <Box sx={{ py: { xs: 3, sm: 5 } }}>
        <BookmarkBorderRounded color="primary" sx={{ fontSize: 32, mb: 2 }} />
        <Typography component="h2" variant="h2">Save the places you use most</Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>Save a stop on the map or a journey from Plan.</Typography>
        <Stack direction="row" spacing={1.5} useFlexGap sx={{ mt: 3, flexWrap: "wrap" }}>
          <Button component={Link} href="/plan" variant="contained">Plan a trip</Button>
          <Button component={Link} href="/map">Find a stop</Button>
        </Stack>
      </Box>}
      {groups.filter((group) => data.items.some((item) => item.kind === group.kind)).map((group) => <Box component="section" key={group.kind} aria-label={group.title}>
        <Typography component="h2" variant="h2" sx={{ mb: 1.5 }}>{group.title}</Typography>
        <Box sx={{ borderTop: 1, borderColor: "divider" }}>
          {data.items.filter((item) => item.kind === group.kind).map((item) => {
            const index = data.items.indexOf(item);
            const retired = item.kind === "stop" && transit.status === "ok" && !transit.data?.stops.some((stop) => stop.id === item.destination.id);
            const detail = item.kind === "stop" ? item.destination.name : `${item.origin?.name} to ${item.destination.name}`;
            const href = item.kind === "stop" ? retired ? "/map" : `/map?stop=${encodeURIComponent(item.destination.id)}` : planRefHref(item.origin, item.destination);
            return <Box component="article" aria-label={item.name} key={item.id} sx={{ py: 2, borderBottom: 1, borderColor: "divider", display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr)", sm: "minmax(0,1fr) auto" }, alignItems: "center", gap: 1 }}>
              <Box component={Link} href={href} aria-label={`${item.name}. ${retired ? "Find a replacement" : item.kind === "stop" ? "View stop and arrivals" : "Plan journey"}`} sx={{ minHeight: 48, minWidth: 0, display: "flex", alignItems: "center", gap: 2, color: "text.primary", textDecoration: "none", "&:hover": { color: "primary.main" } }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography component="h3" variant="h3" sx={{ overflowWrap: "anywhere" }}>{item.name}</Typography>
                  {detail !== item.name && <Typography variant="body2" color="text.secondary" sx={{ mt: .5, overflowWrap: "anywhere" }}>{detail}</Typography>}
                </Box>
                <ArrowForwardRounded fontSize="small" sx={{ flexShrink: 0 }} />
              </Box>
              <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
                <IconButton aria-label={`Rename ${item.name}`} onClick={() => { setEditing(item); setName(item.name); }}><EditRounded fontSize="small" /></IconButton>
                <IconButton aria-label={`Move ${item.name} up`} disabled={index === 0 || data.busy} onClick={() => void data.moveItem(item, -1)}><ArrowUpwardRounded fontSize="small" /></IconButton>
                <IconButton aria-label={`Move ${item.name} down`} disabled={index === data.items.length - 1 || data.busy} onClick={() => void data.moveItem(item, 1)}><ArrowDownwardRounded fontSize="small" /></IconButton>
                <IconButton aria-label={`Remove ${item.name}`} disabled={data.busy} onClick={async () => { if (await data.removeItem(item)) setUndo(item); }}><DeleteOutlineRounded fontSize="small" /></IconButton>
              </Stack>
              {retired && <Alert severity="warning" sx={{ gridColumn: "1 / -1" }}>This stop is no longer available. Choose a replacement on the map.</Alert>}
            </Box>;
          })}
        </Box>
      </Box>)}
      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Rename saved item</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 80 } }}
            helperText="1 to 80 characters"
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!name.trim() || data.busy}
            onClick={async () => {
              if (
                editing &&
                (await data.editItem(editing, { name: name.trim() }))
              )
                setEditing(null);
            }}
          >
            Save name
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={!!undo}
        autoHideDuration={10000}
        onClose={() => setUndo(null)}
        message={undo ? `${undo.name} removed` : "Removed"}
        action={
          <Button
            color="inherit"
            onClick={async () => {
              if (
                undo &&
                (await data.saveItem(
                  undo.destination,
                  undo.origin,
                  undo.name,
                  undo.position,
                ))
              )
                setUndo(null);
            }}
          >
            Undo
          </Button>
        }
      />
    </Stack>
  );
}
