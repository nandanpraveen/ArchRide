"use client";
import Link from "next/link";
import {
  Box,
  Button,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import { usePersonal } from "./personal-provider";
import { planRefHref } from "@/lib/personal";
export function HomeFavorites() {
  const data = usePersonal(),
    items = data.items.slice(0, 4);
  return (
    <Box
      component="section"
      aria-labelledby="favorites-heading"
      sx={{ minWidth: 0 }}
    >
      <Stack spacing={2}>
        <Typography component="h2" variant="h2" id="favorites-heading">
          Your usual places
        </Typography>
        {!items.length ? (
          <Typography variant="body2" color="text.secondary">
            Save a journey or stop for a shortcut here.
          </Typography>
        ) : (
          <List disablePadding>
            {items.map((i) => (
              <ListItemButton
                key={i.id}
                component={Link} prefetch={false}
                href={
                  i.kind === "stop"
                    ? `/map?stop=${encodeURIComponent(i.destination.id)}`
                    : planRefHref(i.origin, i.destination)
                }
                sx={{ px: 0, gap: 1.5, "& .MuiListItemText-root": { overflowWrap: "anywhere" } }}
              >
                <ListItemText
                  primary={i.name}
                  secondary={
                    i.kind === "stop" ? "Saved stop" : "Recalculate journey"
                  }
                />
                <ArrowForwardRounded fontSize="small" color="action" />
              </ListItemButton>
            ))}
          </List>
        )}
        <Button
          component={Link} prefetch={false}
          href="/saved"
          sx={{ alignSelf: "flex-start", px: 0 }}
        >
          Manage saved items
        </Button>
      </Stack>
    </Box>
  );
}
