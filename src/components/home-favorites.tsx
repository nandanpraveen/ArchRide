"use client";
import Link from "next/link";
import {
  Button,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Paper,
  Typography,
} from "@mui/material";
import { useSavedStops } from "@/lib/use-saved-stops";

export function HomeFavorites() {
  const stops = useSavedStops().slice(0, 5);
  return (
    <Paper
      component="section"
      variant="outlined"
      aria-labelledby="favorites-heading"
      sx={{ p: 3, bgcolor: "background.default" }}
    >
      <Typography
        component="h2"
        variant="h3"
        id="favorites-heading"
        sx={{ mb: 1 }}
      >
        Favorites
      </Typography>
      {stops.length === 0 ? (
        <Typography color="text.secondary">
          Stops you save will appear here. Open a stop on the map and choose
          Save stop.
        </Typography>
      ) : (
        <List disablePadding>
          {stops.map((stop) => (
            <ListItem key={stop.id} disablePadding>
              <ListItemButton
                component={Link}
                href={`/map?stop=${encodeURIComponent(stop.id)}`}
                sx={{ minHeight: 48 }}
              >
                <ListItemText
                  primary={stop.name}
                  slotProps={{ primary: { sx: { overflowWrap: "anywhere" } } }}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      )}
      <Button component={Link} href="/saved" sx={{ mt: 1 }}>
        Manage saved items
      </Button>
    </Paper>
  );
}