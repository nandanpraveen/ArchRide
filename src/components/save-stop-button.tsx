"use client";
import { useState } from "react";
import { Button, Typography } from "@mui/material";
import BookmarkBorderRounded from "@mui/icons-material/BookmarkBorderRounded";
import BookmarkRounded from "@mui/icons-material/BookmarkRounded";
import { saveStop, unsaveStop } from "@/lib/saved";
import { useSavedStops } from "@/lib/use-saved-stops";

export function SaveStopButton({
  stop,
}: {
  stop: { id: string; name: string };
}) {
  const saved = useSavedStops().some((item) => item.id === stop.id);
  const [failed, setFailed] = useState(false);

  function toggle() {
    const result = saved ? unsaveStop(stop.id) : saveStop(stop);
    setFailed(!result.ok);
  }

  return (
    <>
      <Button
        variant="outlined"
        aria-pressed={saved}
        startIcon={saved ? <BookmarkRounded /> : <BookmarkBorderRounded />}
        onClick={toggle}
      >
        {saved ? "Saved" : "Save stop"}
      </Button>
      {failed && (
        <Typography role="status" color="error" variant="caption">
          Couldn&apos;t save on this device. Storage may be full or blocked.
        </Typography>
      )}
    </>
  );
}