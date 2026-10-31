"use client";
import { useEffect, useState } from "react";
import { findMissingBuildings } from "@/lib/campus-data";

// Building ids that campus data no longer lists. Stays empty until a check succeeds, so a
// student who is offline never sees their classes wrongly marked as retired.
export function useMissingBuildings(buildingIds: string[]) {
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const key = JSON.stringify([...new Set(buildingIds)].sort());

  useEffect(() => {
    const ids: string[] = JSON.parse(key);
    const controller = new AbortController();
    void findMissingBuildings(ids, controller.signal).then((result) => {
      if (!controller.signal.aborted && result) setMissing(result);
    });
    return () => controller.abort();
  }, [key]);

  return missing;
}
