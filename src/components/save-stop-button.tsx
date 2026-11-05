"use client";
import { Button, Typography } from "@mui/material";
import BookmarkBorderRounded from "@mui/icons-material/BookmarkBorderRounded";
import BookmarkRounded from "@mui/icons-material/BookmarkRounded";
import { usePersonal } from "./personal-provider";
export function SaveStopButton({
  stop,
}: {
  stop: { id: string; name: string };
}) {
  const data = usePersonal(),
    existing = data.items.find((i) => i.key === `stop:${stop.id}`);
  return (
    <>
      <Button
        variant="outlined"
        aria-pressed={!!existing}
        disabled={!data.ready || data.busy}
        startIcon={existing ? <BookmarkRounded /> : <BookmarkBorderRounded />}
        onClick={() =>
          void (existing
            ? data.removeItem(existing)
            : data.saveItem({ ...stop, type: "stop" }))
        }
      >
        {existing ? "Saved" : "Save stop"}
      </Button>
      {data.error && (
        <Typography color="error" variant="caption" role="status">
          {data.error}
        </Typography>
      )}
    </>
  );
}
