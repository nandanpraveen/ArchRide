"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@mui/material";
import ZoomOutMapRounded from "@mui/icons-material/ZoomOutMapRounded";
import { useRouter } from "next/navigation";
import * as maplibregl from "maplibre-gl";
import type { Route, Stop, Vehicle } from "@/lib/transit/contracts";
import { vehicleFreshness } from "@/lib/transit/contracts";
import { mapCoordinates, routeColor } from "@/lib/transit/map-data";
import "maplibre-gl/dist/maplibre-gl.css";
import { sitePath } from "@/lib/site";
import { PARKING_LOTS, type ParkingLot } from "@/lib/parking";
import {
  CAMPUS_CENTER,
  CAMPUS_MAX_BOUNDS,
  constrainCampusCamera,
  insideCampusBounds,
} from "@/lib/campus-bounds";

type TransitMapProps = {
  routes: Route[];
  stops: Stop[];
  vehicles: Vehicle[];
  path: [number, number][];
  pathId?: string;
  selectedStop?: Stop;
  selectedVehicle?: Vehicle;
  selectedPlace?: { latitude: number; longitude: number; name: string };
  route?: Route;
  showParking?: boolean;
  selectedParking?: ParkingLot;
  onParkingSelect?: (id: string) => void;
  onSelect: (kind: "stop" | "vehicle", id: string) => void;
  onTilesFailed: () => void;
};

export default function TransitMap({
  routes,
  stops,
  vehicles,
  path,
  pathId,
  selectedStop,
  selectedVehicle,
  selectedPlace,
  route,
  showParking = true,
  selectedParking,
  onParkingSelect,
  onSelect,
  onTilesFailed,
}: TransitMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const lastSelection = useRef("");
  const fittedPath = useRef("");
  const [mapReady, setMapReady] = useState(false);
  const [outsideArea, setOutsideArea] = useState(false);
  const router = useRouter();
  // Compare geometry by value: clocks and feed refreshes create new arrays.
  const pathKey = JSON.stringify(path);
  const cameraKey = pathId || route?.id || pathKey;
  const color = routeColor(route);
  const focusSelected = !!(selectedStop || selectedVehicle || selectedPlace || selectedParking);
  const fitPath = useCallback(() => {
    const map = mapRef.current;
    const coordinates: [number, number][] = JSON.parse(pathKey);
    if (!map || coordinates.length < 2) return;
    const bounds = coordinates.reduce(
      (bounds, point) => bounds.extend(point),
      new maplibregl.LngLatBounds(coordinates[0], coordinates[0]),
    );
    map.fitBounds(bounds, { padding: 40, duration: 0, maxZoom: 16 });
  }, [pathKey]);

  useEffect(() => {
    if (!containerRef.current) return;
    let map: maplibregl.Map;
    try {
      maplibregl.setWorkerUrl(sitePath("/maplibre-gl-worker.mjs"));
      map = new maplibregl.Map({
        container: containerRef.current,
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution:
                '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
            },
          },
          layers: [{ id: "osm", type: "raster", source: "osm" }],
        },
        center: CAMPUS_CENTER,
        zoom: 14,
        minZoom: 12,
        maxZoom: 20,
        maxBounds: CAMPUS_MAX_BOUNDS,
        maxPitch: 0,
        dragRotate: false,
        touchPitch: false,
        pitchWithRotate: false,
        transformCameraUpdate: (next) => {
          const size = containerRef.current?.getBoundingClientRect();
          const safe = constrainCampusCamera(
            next.center.lng,
            next.center.lat,
            next.zoom,
            size?.width,
            size?.height,
          );
          return {
            center: new maplibregl.LngLat(...safe.center),
            zoom: safe.zoom,
            bearing: 0,
            pitch: 0,
            roll: 0,
          };
        },
        renderWorldCopies: false,
      });
    } catch {
      onTilesFailed();
      return;
    }
    mapRef.current = map;
    map.once("load", () => setMapReady(true));
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    const locate = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: false, timeout: 10_000 },
      trackUserLocation: false,
      fitBoundsOptions: { maxZoom: 16 },
    });
    locate.on("outofmaxbounds", () => setOutsideArea(true));
    locate.on("geolocate", (event) =>
      setOutsideArea(
        !insideCampusBounds(event.coords.longitude, event.coords.latitude),
      ),
    );
    map.addControl(locate, "top-right");
    map.touchZoomRotate.disableRotation();
    let reported = false;
    map.on("error", () => {
      if (!reported) onTilesFailed();
      reported = true;
    });
    const observer = new ResizeObserver(() => {
      map.resize();
      map.jumpTo({ center: map.getCenter() });
    });
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      mapRef.current = null;
      map.remove();
    };
  }, [onTilesFailed]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers: maplibregl.Marker[] = [];
    const marker = (
      kind: "stop" | "vehicle",
      row: Stop | Vehicle,
      color: string,
      label: string,
    ) => {
      if (!mapCoordinates(row.longitude, row.latitude)) return;
      const button = document.createElement("button");
      button.type = "button";
      button.tabIndex = -1; // Route/stop directory provides the keyboard selection alternative.
      button.setAttribute("aria-label", label);
      button.title = label;
      button.dataset.mapMarker = kind;
      const selected =
        kind === "vehicle"
          ? row.id === selectedVehicle?.id
          : row.id === selectedStop?.id;
      const stale =
        kind === "vehicle" && vehicleFreshness(row as Vehicle) !== "current";
      button.setAttribute("aria-pressed", String(selected));
      Object.assign(button.style, {
        width: "44px",
        height: "44px",
        display: "grid",
        placeItems: "center",
        padding: "0",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        zIndex: selected ? "30" : kind === "vehicle" ? "10" : "1",
      });
      const pin = document.createElement("span");
      Object.assign(pin.style, {
        display: "grid",
        placeItems: "center",
        boxSizing: "border-box",
        width:
          kind === "stop"
            ? selected
              ? "16px"
              : "10px"
            : selected
              ? "34px"
              : "28px",
        height:
          kind === "stop"
            ? selected
              ? "16px"
              : "10px"
            : selected
              ? "34px"
              : "28px",
        borderRadius: kind === "stop" ? "50%" : "8px",
        border: `2px ${stale ? "dashed" : "solid"} ${kind === "stop" ? "#ffffff" : stale ? "#737b83" : color}`,
        background: kind === "stop" ? color : "#ffffff",
        color: stale ? "#737b83" : "#18222b",
        boxShadow: selected
          ? "0 0 0 3px #ffffff, 0 0 0 5px #18222b"
          : "0 1px 4px #18222b30",
      });
      if (kind === "vehicle") {
        // Match the existing Material bus glyph; fixed pixels keep map symbols stable at enlarged text.
        const icon = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "svg",
        );
        icon.setAttribute("viewBox", "0 0 24 24");
        icon.setAttribute("width", selected ? "22" : "18");
        icon.setAttribute("height", selected ? "22" : "18");
        icon.setAttribute("fill", "currentColor");
        icon.setAttribute("aria-hidden", "true");
        const shape = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "path",
        );
        shape.setAttribute(
          "d",
          "M4 16c0 .88.39 1.67 1 2.22v1.28c0 .83.67 1.5 1.5 1.5S8 20.33 8 19.5V19h8v.5c0 .82.67 1.5 1.5 1.5.82 0 1.5-.67 1.5-1.5v-1.28c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17m9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5m1.5-6H6V6h12z",
        );
        icon.append(shape);
        pin.append(icon);
      }
      button.append(pin);
      button.addEventListener("click", () => onSelect(kind, row.id));
      markers.push(
        new maplibregl.Marker({ element: button })
          .setLngLat([row.longitude, row.latitude])
          .addTo(map),
      );
    };
    stops.forEach((stop) =>
      marker("stop", stop, "#343434", `Open stop ${stop.name}`),
    );
    vehicles.forEach((vehicle) => {
      const route = routes.find((r) => r.id === vehicle.route_id);
      marker(
        "vehicle",
        vehicle,
        routeColor(route),
        `Open bus ${vehicle.source_id_raw}, ${route?.long_name || "route unavailable"}, ${vehicleFreshness(vehicle)} position`,
      );
    });
    if (showParking)
      PARKING_LOTS.forEach((lot) => {
        const button = document.createElement("button");
        button.type = "button";
        button.tabIndex = -1; // Every lot is keyboard reachable in the parking directory.
        button.setAttribute(
          "aria-label",
          `Open parking ${lot.code}: ${lot.name}`,
        );
        button.title = `${lot.code}: ${lot.name}`;
        Object.assign(button.style, {
          width: "48px",
          height: "48px",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          padding: "10px",
        });
        const pin = document.createElement("span");
        pin.textContent = "P";
        Object.assign(pin.style, {
          display: "grid",
          placeItems: "center",
          width: "28px",
          height: "28px",
          borderRadius: "8px",
          border: "2px solid #fcfcfd",
          background: selectedParking?.id === lot.id ? "#ac2336" : "#35515a",
          color: "#fcfcfd",
          font: "700 16px Arial, sans-serif",
          boxShadow: "0 2px 5px #20263030",
        });
        button.append(pin);
        button.addEventListener("click", () =>
          onParkingSelect
            ? onParkingSelect(lot.id)
            : router.push(`/map?parking=${lot.id}`),
        );
        markers.push(
          new maplibregl.Marker({ element: button })
            .setLngLat([lot.longitude, lot.latitude])
            .addTo(map),
        );
      });
    if (selectedPlace) {
      const { longitude, latitude, name } = selectedPlace;
      if (mapCoordinates(longitude, latitude)) {
        const element = document.createElement("div");
        element.textContent = "◆";
        element.title = name;
        element.setAttribute("aria-label", name);
        Object.assign(element.style, { fontSize: "32px", color: "#8f2631" });
        markers.push(
          new maplibregl.Marker({ element })
            .setLngLat([longitude, latitude])
            .addTo(map),
        );
      }
    }
    const selected =
      selectedParking || selectedStop || selectedVehicle || selectedPlace;
    const selectionKey =
      selectedParking?.id ||
      selectedStop?.id ||
      selectedVehicle?.id ||
      selectedPlace?.name ||
      "";
    if (
      selected &&
      selectionKey !== lastSelection.current &&
      mapCoordinates(selected.longitude, selected.latitude)
    ) {
      map.jumpTo({
        center: [selected.longitude, selected.latitude],
        zoom: Math.max(15, map.getZoom()),
      });
    }
    lastSelection.current = selectionKey;
    return () => markers.forEach((m) => m.remove());
  }, [
    stops,
    vehicles,
    routes,
    selectedStop,
    selectedVehicle,
    selectedPlace,
    selectedParking,
    showParking,
    onParkingSelect,
    router,
    onSelect,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const draw = () => {
      const coordinates: [number, number][] = JSON.parse(pathKey);
      const data = {
        type: "FeatureCollection" as const,
        features: coordinates.length < 2 ? [] : [{
          type: "Feature" as const, properties: {},
          geometry: { type: "LineString" as const, coordinates },
        }],
      };
      const source = map.getSource("selected-route") as maplibregl.GeoJSONSource | undefined;
      if (source) source.setData(data);
      else {
        map.addSource("selected-route", { type: "geojson", data });
        map.addLayer({
          id: "selected-route", type: "line", source: "selected-route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": color, "line-width": 5 },
        });
      }
      map.setPaintProperty("selected-route", "line-color", color);
      if (coordinates.length < 2) fittedPath.current = "";
      else if (cameraKey !== fittedPath.current) {
        if (!focusSelected) fitPath();
        fittedPath.current = cameraKey;
      }
    };
    draw();
  }, [mapReady, pathKey, color, cameraKey, focusSelected, fitPath]);

  return (
    <>
      <div
        ref={containerRef}
        role="region"
        aria-label="Campus map"
        style={{ position: "absolute", inset: 0 }}
      />
      {path.length > 1 && (
        <Button
          onClick={fitPath}
          startIcon={<ZoomOutMapRounded />}
          variant="outlined"
          sx={{ position: "absolute", left: 12, top: 12, bgcolor: "background.paper", color: "text.primary", borderColor: "divider", "&:hover": { bgcolor: "background.default" } }}
        >
          Fit route
        </Button>
      )}
      {outsideArea && (
        <div
          role="status"
          style={{
            position: "absolute",
            left: 12,
            right: 60,
            top: 12,
            padding: 12,
            borderRadius: 12,
            background: "#fcfcfd",
            color: "#202630",
            fontSize: 14,
            boxShadow: "0 2px 8px #20263020",
          }}
        >
          Your location is outside the supported campus area. Choose a campus
          place manually; the map stays within campus and its three-mile buffer.
        </div>
      )}
    </>
  );
}
