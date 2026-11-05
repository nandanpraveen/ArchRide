"use client";
import { useEffect, useState } from "react";
import { Alert, Box, Button, Chip, List, ListItem, ListItemButton, ListItemText, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { CATEGORY_LABEL, DAYS, PARKING_EVENTS, PARKING_LOTS, PARKING_SOURCE, gamedayNotice, parkingAccess, parkingSchedule, parkingTime } from "@/lib/parking";

const disclosure = { minHeight: 48, py: 1.5, cursor: "pointer", fontWeight: 600 };
export function ParkingDirectory({ selectedId, onSelect, query }: { selectedId: string | null; onSelect: (id: string) => void; query: string }) {
  const [expanded, setExpanded] = useState(false), [eventStatus, setEventStatus] = useState<"unverified" | "ordinary" | "event">("unverified");
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    refresh();
    const timer = window.setInterval(refresh, 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  const lot = PARKING_LOTS.find(p => p.id === selectedId);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = PARKING_LOTS.filter(p => words.every(w => `${p.code} ${p.name} ${p.type}`.toLowerCase().includes(w)));
  const category = lot && now ? parkingAccess(lot, now, eventStatus) : "unknown";
  return <Stack spacing={2} component="section" aria-label="Parking directory" id="parking-directory">
    {selectedId && !lot && <Alert severity="warning">This parking location is not in the verified inventory. Choose a lot below.</Alert>}
    {lot && <Stack key={lot.id} component="section" aria-label="Parking details" spacing={2} sx={{ minWidth: 0 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
        <Chip label={lot.code} size="small" color="primary" />
        <Typography variant="body2" color="text.secondary">{lot.type === "deck" ? "Parking deck" : "Parking lot"}</Typography>
      </Stack>
      <Typography component="h2" variant="h2" tabIndex={-1} sx={{ overflowWrap: "anywhere" }}>{lot.name}</Typography>
      <TextField select label="Event conditions" disabled={now === null} value={eventStatus} onChange={e => setEventStatus(e.target.value as typeof eventStatus)}>
        <MenuItem value="unverified">Event status not checked</MenuItem>
        <MenuItem value="ordinary">I have checked: ordinary day</MenuItem>
        <MenuItem value="event">Gameday or special event</MenuItem>
      </TextField>
      <Alert severity={category === "unknown" || category === "restricted" ? "warning" : "info"}>
        {CATEGORY_LABEL[category]}
        {eventStatus !== "unverified" && <Typography variant="body2" sx={{ mt: 0.5 }}>Usual rule for Athens campus time. Posted and event restrictions still apply.</Typography>}
      </Alert>
      <Stack spacing={0} sx={{ "& > details": { borderBottom: 1, borderColor: "divider" } }}>
        <Box component="details">
          <Box component="summary" sx={disclosure}>Weekly hours</Box>
          <Box component="dl" sx={{ m: 0, pb: 1 }}>
            {DAYS.map((day, index) => <Box key={day} sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr)", sm: "90px minmax(0,1fr)" }, columnGap: 2, rowGap: 0.5, py: 1 }}>
              <Typography component="dt" variant="body2" sx={{ fontWeight: 700 }}>{day}</Typography>
              <Box component="dd" sx={{ m: 0 }}>{parkingSchedule(lot, index).map(w => <Typography key={w.start} variant="body2" sx={{ mb: 0.5 }}>{parkingTime(w.start)} to {parkingTime(w.end)}: {CATEGORY_LABEL[w.category]}</Typography>)}</Box>
            </Box>)}
          </Box>
        </Box>
        <Box component="details"><Box component="summary" sx={disclosure}>Permits, registration & visitors</Box>
          <Stack spacing={1.5} sx={{ pb: 2 }}>
            <Typography variant="body2">A permit must be valid for this lot. Registration is separate from a parking permit: it means a current UGA student, faculty or staff member has added the vehicle to their TPS account. Using ArchRide gives no parking rights.</Typography>
            <Typography variant="body2">{lot.paid.replace(/—|–/g, "-")}</Typography>
            {lot.notes.map(note => <Typography key={note} variant="body2" color="text.secondary">{note}</Typography>)}
          </Stack>
        </Box>
        <Box component="details"><Box component="summary" sx={disclosure}>Events & special spaces</Box>
          <Typography variant="body2" sx={{ pb: 1.5 }}>{gamedayNotice(lot)} Reserved, accessible and state-vehicle spaces and fire lanes have separate restrictions at all times.</Typography>
          <Button component="a" href={PARKING_EVENTS} target="_blank" rel="noopener noreferrer" sx={{ mb: 1 }}>Event restrictions ↗</Button>
        </Box>
        <Box component="details"><Box component="summary" sx={disclosure}>Sources & verification</Box>
          <Typography variant="body2" color="text.secondary" sx={{ pb: 1.5 }}>Checked November 3, 2026. Times use America/New_York. Missing, conflicting and overnight rules stay unknown.</Typography>
          <Stack spacing={1} sx={{ pb: 2 }}>{lot.sources.map((source, index) => <a key={source} href={source} target="_blank" rel="noopener noreferrer" className="quiet-link">{["TPS enforcement", "TPS permit maps", "UGA mapped location", "TPS visitor parking", "TPS published regulations"][index]}</a>)}</Stack>
        </Box>
      </Stack>
      <Button component="a" href={PARKING_SOURCE} target="_blank" rel="noopener noreferrer" sx={{ alignSelf: "flex-start", whiteSpace: "normal", textAlign: "left", px: 0 }}>TPS parking rules ↗</Button>
    </Stack>}
    <Box>
      <Typography component="h2" variant="h3">{lot ? "Other parking locations" : "Parking locations"}</Typography>
      <Typography variant="caption" color="text.secondary">{matches.length} {words.length ? "matches" : "UGA locations"}</Typography>
    </Box>
    <List aria-label="Parking lots and decks" disablePadding>
      {(expanded || words.length ? matches : matches.slice(0, 8)).map(p => <ListItem key={p.id} disablePadding><ListItemButton disabled={now === null} onClick={() => onSelect(p.id)} selected={selectedId === p.id} sx={{ px: 1 }}><ListItemText primary={`${p.code}: ${p.name}`} /></ListItemButton></ListItem>)}
    </List>
    {!matches.length && <Typography variant="body2">No parking locations match this search. Try a lot code such as E23.</Typography>}
    {!expanded && !words.length && matches.length > 8 && <Button disabled={now === null} variant="outlined" onClick={() => setExpanded(true)}>Show all {PARKING_LOTS.length} locations</Button>}
  </Stack>;
}
