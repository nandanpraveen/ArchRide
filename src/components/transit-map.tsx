"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type TransitMapProps = {
  onTilesFailed?: () => void;
};

// Center of UGA's campus (Athens, GA).
const CAMPUS_CENTER: [number, number] = [-83.3754, 33.9519];

export default function TransitMap({ onTilesFailed }: TransitMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // The worker is served from /public (copied from node_modules/maplibre-gl/dist)
    // because the bundler does not package it automatically.
    maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

    const map = new maplibregl.Map({
      container,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center: CAMPUS_CENTER,
      zoom: 14,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    let reported = false;
    map.on("error", () => {
      if (reported) return;
      reported = true;
      onTilesFailed?.();
    });

    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container);

    return () => {
      observer.disconnect();
      map.remove();
    };
  }, [onTilesFailed]);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="Campus map"
      style={{ position: "absolute", inset: 0 }}
    />
  );
}