"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { Alert, Box, Button, CircularProgress, Stack, Typography } from "@mui/material";

// MapLibre needs `window`, so the map is only rendered in the browser.
const TransitMap = dynamic(() => import("@/components/transit-map"), {
  ssr: false,
  loading: () => (
    <Stack
      spacing={2}
      sx={{ alignItems: "center", justifyContent: "center", height: "100%" }}
    >
      <CircularProgress aria-label="Loading map" />
    </Stack>
  ),
});

export default function MapPage() {
  const [tilesFailed, setTilesFailed] = useState(false);
  const [mapKey, setMapKey] = useState(0);

  const handleTilesFailed = useCallback(() => setTilesFailed(true), []);

  const handleRetry = () => {
    setTilesFailed(false);
    setMapKey((key) => key + 1);
  };

  return (
    <Stack spacing={3}>
      <Typography component="h1" variant="h1">
        Campus map
      </Typography>

      {tilesFailed && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={handleRetry} sx={{ minHeight: 48 }}>
              Retry
            </Button>
          }
        >
          The map could not load. Check your connection and try again.
        </Alert>
      )}

      <Typography variant="body2" color="text.secondary">
        Route lines, boarding stops, and bus positions will appear here once the
        transit source is connected. No vehicle positions are available right now.
      </Typography>

      <Box
        sx={{
          position: "relative",
          height: "min(70dvh, 640px)",
          minHeight: 360,
          borderRadius: 3,
          overflow: "hidden",
          border: 1,
          borderColor: "divider",
        }}
      >
        <TransitMap key={mapKey} onTilesFailed={handleTilesFailed} />
      </Box>
    </Stack>
  );
}