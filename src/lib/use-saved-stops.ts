"use client";
import { useSyncExternalStore } from "react";
import { getSavedStops, subscribeSavedStops, type SavedStop } from "./saved";

const EMPTY: SavedStop[] = [];

export function useSavedStops(): SavedStop[] {
  return useSyncExternalStore(subscribeSavedStops, getSavedStops, () => EMPTY);
}