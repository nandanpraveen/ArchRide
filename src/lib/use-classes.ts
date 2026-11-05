"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ClassEntry } from "@/app/classes/next-class";
import { readDeviceClasses, validateClass, writeDeviceClasses, type ClassDraft } from "./classes";
export type ClassesSource = "device";
export type ClassesStatus = "loading" | "ready" | "error";
const CHANGED = "archride:classes-changed";

export function useClasses() {
  const [state, setState] = useState<{ classes: ClassEntry[]; status: ClassesStatus }>({ classes: [], status: "loading" });
  const [saveError, setSaveError] = useState("");
  const saving = useRef(false), generation = useRef(0);
  const reload = useCallback(() => setState({ classes: readDeviceClasses(), status: "ready" }), []);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) reload(); });
    const cleared = () => { generation.current++; reload(); };
    const storage = (event: StorageEvent) => { if (event.newValue === null) generation.current++; reload(); };
    window.addEventListener("storage", storage);
    window.addEventListener("focus", reload);
    window.addEventListener(CHANGED, reload);
    window.addEventListener("archride:device-data-cleared", cleared);
    return () => {
      active = false;
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", reload);
      window.removeEventListener(CHANGED, reload);
      window.removeEventListener("archride:device-data-cleared", cleared);
    };
  }, [reload]);
  const change = async (kind: "add" | "update" | "remove", id: string | null, draft?: ClassDraft) => {
    if (saving.current || state.status !== "ready") return false;
    if (draft && Object.keys(validateClass(draft)).length) {
      setSaveError("Check the class details and try again.");
      return false;
    }
    saving.current = true;
    setSaveError("");
    const stamp = generation.current;
    try {
      const commit = () => {
        if (generation.current !== stamp) return false;
        const current = readDeviceClasses();
        if (kind === "add" && current.length >= 200) throw new Error("Remove an old class before adding another.");
        if (kind !== "add" && !current.some((entry) => entry.id === id)) throw new Error("This class was changed in another tab. Reload and try again.");
        const next = kind === "remove" ? current.filter((entry) => entry.id !== id)
          : kind === "update" ? current.map((entry) => entry.id === id ? { ...draft!, title: draft!.title.trim(), id: entry.id } : entry)
          : [...current, { ...draft!, title: draft!.title.trim(), id: crypto.randomUUID() }];
        if (!writeDeviceClasses(next)) throw new Error("This browser could not save your schedule. Storage may be full or blocked.");
        setState({ classes: next, status: "ready" });
        window.dispatchEvent(new Event(CHANGED));
        return true;
      };
      // Native locks prevent two tabs from overwriting each other's local edits.
      return navigator.locks ? await navigator.locks.request("archride:classes", commit) : commit();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Your change could not be saved.");
      return false;
    } finally { saving.current = false; }
  };
  return {
    ...state, source: "device" as ClassesSource, saveError,
    add: (draft: ClassDraft) => change("add", null, draft),
    update: (id: string, draft: ClassDraft) => change("update", id, draft),
    remove: (id: string) => change("remove", id), reload,
  };
}
