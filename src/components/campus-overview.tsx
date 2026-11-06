"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Box, Button, Skeleton, Stack, Typography } from "@mui/material";
import ArrowOutwardRounded from "@mui/icons-material/ArrowOutwardRounded";
import type { PublicTransitData } from "@/lib/transit/public-data";
const Map = dynamic(() => import("./transit-map"), {
  ssr: false,
  loading: () => <Skeleton variant="rectangular" height="100%" />,
});
const EMPTY: [number, number][] = [];
export function CampusOverview({
  data,
  path = EMPTY,
  unavailable = false,
}: {
  data: PublicTransitData | null;
  path?: [number, number][];
  unavailable?: boolean;
}) {
  const [failed, setFailed] = useState(false),
    [version, setVersion] = useState(0),
    router = useRouter();
  const failure = useCallback(() => setFailed(true), []);
  const select = useCallback(
    (kind: "stop" | "vehicle", id: string) =>
      router.push(`/map?${kind}=${encodeURIComponent(id)}`),
    [router],
  );
  const mapVisible = !!data && !failed;
  return (
    <Box
      sx={{
        height: "100%",
        minHeight: 340,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        borderRadius: "12px",
        overflow: "hidden",
        border: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
      }}
    >
      {mapVisible ? (
        <Map
          key={version}
          routes={data.routes}
          stops={path.length ? [] : data.stops}
          vehicles={[]}
          showParking={false}
          path={path}
          onSelect={select}
          onTilesFailed={failure}
        />
      ) : (
        <Box
          sx={{
            display: "grid",
            placeItems: "center",
            flex: 1,
            minWidth: 0,
            p: 3,
            textAlign: "center",
          }}
        >
          <Stack spacing={1.5}>
            <Typography color="text.secondary" role="status">
              {failed
                ? "Map tiles could not load. Open the directory or try again."
                : unavailable
                  ? "Campus map data is unavailable. Open the directory for stops and parking."
                  : "Loading map…"}
            </Typography>
            {failed && (
              <Button
                onClick={() => {
                  setFailed(false);
                  setVersion((v) => v + 1);
                }}
              >
                Retry map
              </Button>
            )}
          </Stack>
        </Box>
      )}
      <Box
        sx={{
          position: mapVisible ? "absolute" : "static",
          left: mapVisible ? 16 : undefined,
          bottom: mapVisible ? 16 : undefined,
          right: mapVisible ? 16 : undefined,
          p: mapVisible ? 0 : 2,
          display: "flex",
          justifyContent: "flex-start",
          pointerEvents: "none",
        }}
      >
        <Button
          component={Link} prefetch={false}
          href="/map"
          variant="contained"
          endIcon={<ArrowOutwardRounded />}
          sx={{
            pointerEvents: "auto",
            maxWidth: "100%",
            whiteSpace: "normal",
            textAlign: "left",
            bgcolor: "background.paper",
            color: "text.primary",
            boxShadow: "0 4px 20px #20263018",
            "&:hover": { bgcolor: "background.default" },
          }}
        >
          Open map
        </Button>
      </Box>
    </Box>
  );
}
