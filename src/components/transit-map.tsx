"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { Route, Stop, Vehicle } from "@/lib/transit/contracts";
import { vehicleFreshness } from "@/lib/transit/contracts";
import { mapCoordinates, routeColor } from "@/lib/transit/map-data";
import "maplibre-gl/dist/maplibre-gl.css";

type TransitMapProps = {
  routes: Route[];
  stops: Stop[];
  vehicles: Vehicle[];
  path: [number, number][];
  selectedStop?: Stop;
  selectedVehicle?: Vehicle;
  selectedPlace?: { latitude: number; longitude: number; name: string };
  route?: Route;
  onSelect: (kind: "stop" | "vehicle", id: string) => void;
  onTilesFailed: () => void;
};

export default function TransitMap({ routes, stops, vehicles, path, selectedStop, selectedVehicle, selectedPlace, route, onSelect, onTilesFailed }: TransitMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let map: maplibregl.Map;
    try {
      maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
      map = new maplibregl.Map({
        container: containerRef.current,
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
            },
          },
          layers: [{ id: "osm", type: "raster", source: "osm" }],
        },
        center: [-83.3754, 33.9519],
        zoom: 14,
        renderWorldCopies: false,
      });
    } catch {
      onTilesFailed();
      return;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: false, timeout: 10_000 },
      trackUserLocation: false,
      fitBoundsOptions: { maxZoom: 16 },
    }), "top-right");
    let reported = false;
    map.on("error", () => {
      if (!reported) onTilesFailed();
      reported = true;
    });
    const observer = new ResizeObserver(() => map.resize());
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
    const marker = (kind: "stop" | "vehicle", row: Stop | Vehicle, color: string, label: string) => {
      if (!mapCoordinates(row.longitude, row.latitude)) return;
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = kind === "stop" ? "●" : "Bus";
      button.setAttribute("aria-label", label);
      button.title = label;
      Object.assign(button.style, {
        minWidth: "48px", minHeight: "48px", borderRadius: "50%",
        border: "2px solid white", background: color, color: "white",
        fontSize: kind === "stop" ? "18px" : "12px", cursor: "pointer",
      });
      if (kind === "vehicle" && vehicleFreshness(row as Vehicle) !== "current") {
        button.style.background = "#555";
        button.style.borderStyle = "dashed";
      }
      button.addEventListener("click", () => onSelect(kind, row.id));
      markers.push(new maplibregl.Marker({ element: button }).setLngLat([row.longitude, row.latitude]).addTo(map));
    };
    stops.forEach((stop) => marker("stop", stop, "#343434", `Open stop ${stop.name}`));
    vehicles.forEach((vehicle) => {
      const route = routes.find((r) => r.id === vehicle.route_id);
      marker("vehicle", vehicle, routeColor(route), `Open bus ${vehicle.source_id_raw}, ${route?.long_name || "route unavailable"}, ${vehicleFreshness(vehicle)} position`);
    });
    if (selectedPlace) {
      const { longitude, latitude, name } = selectedPlace;
      if (mapCoordinates(longitude, latitude)) {
        const element = document.createElement("div");
        element.textContent = "◆";
        element.title = name;
        element.setAttribute("aria-label", name);
        Object.assign(element.style, { fontSize: "32px", color: "#8f2631" });
        markers.push(new maplibregl.Marker({ element }).setLngLat([longitude, latitude]).addTo(map));
      }
    }
    const selected = selectedStop || selectedVehicle || selectedPlace;
    if (selected && mapCoordinates(selected.longitude, selected.latitude)) {
      map.jumpTo({ center: [selected.longitude, selected.latitude], zoom: Math.max(15, map.getZoom()) });
    }
    return () => markers.forEach((m) => m.remove());
  }, [stops, vehicles, routes, selectedStop, selectedVehicle, selectedPlace, onSelect]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const draw = () => {
      if (map.getLayer("selected-route")) map.removeLayer("selected-route");
      if (map.getSource("selected-route")) map.removeSource("selected-route");
      if (path.length < 2) return;
      map.addSource("selected-route", {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: path } },
      });
      map.addLayer({ id: "selected-route", type: "line", source: "selected-route", paint: { "line-color": routeColor(route), "line-width": 5 } });
      if (!selectedStop && !selectedVehicle) {
        const bounds = path.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(path[0], path[0]));
        map.fitBounds(bounds, { padding: 40, duration: 0, maxZoom: 16 });
      }
    };
    if (map.isStyleLoaded()) draw();
    else map.once("load", draw);
    return () => { map.off("load", draw); };
  }, [path, route, selectedStop, selectedVehicle]);

  return <div ref={containerRef} role="region" aria-label="Campus map" style={{ position: "absolute", inset: 0 }} />;
}
