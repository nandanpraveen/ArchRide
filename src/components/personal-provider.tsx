"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useColorScheme } from "@mui/material/styles";
import { deviceKey } from "@/lib/device-storage";
import { DEFAULT_TRAVEL, placeRef, readPersonalDevice, savedKey, validActive, validSaved, validTravel, type ActiveTrip, type PlaceRef, type SavedItem, type TravelPreferences } from "@/lib/personal";

type State = { prefs: TravelPreferences; items: SavedItem[]; active: ActiveTrip | null; ready: boolean };
const Context = createContext<ReturnType<typeof usePersonalState> | null>(null);
export function usePersonal() {
  const value = useContext(Context);
  if (!value) throw new Error("PersonalProvider missing");
  return value;
}
function usePersonalState() {
  const [state, setState] = useState<State>({ prefs: DEFAULT_TRAVEL, items: [], active: null, ready: false });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = useRef(false), generation = useRef(0);
  const cancelPending = useCallback(() => { generation.current++; ready.current = false; }, []);
  const { setMode } = useColorScheme();
  const reload = useCallback(() => {
    ready.current = true;
    setState({ ...readPersonalDevice(), ready: true });
    setError("");
  }, []);
  useEffect(() => {
    queueMicrotask(reload);
    const stored = (event: StorageEvent) => {
      if (!event.key || event.key === deviceKey("archride.personal.v1")) {
        if (event.newValue === null) generation.current++;
        reload();
      }
    };
    const cleared = () => { generation.current++; reload(); };
    window.addEventListener("archride:device-data-cleared", cleared);
    window.addEventListener("storage", stored);
    window.addEventListener("focus", reload);
    return () => { cancelPending(); window.removeEventListener("archride:device-data-cleared", cleared); window.removeEventListener("storage", stored); window.removeEventListener("focus", reload); };
  }, [reload, cancelPending]);
  useEffect(() => { if (state.ready) setMode(state.prefs.theme); }, [state.ready, state.prefs.theme, setMode]);
  const change = async (update: (current: State) => State) => {
    if (!ready.current) return false;
    setBusy(true);
    setError("");
    const stamp = generation.current;
    try {
      const commit = () => {
      if (stamp !== generation.current) return false;
      // Read at the write boundary so a change in another tab is retained.
      const next = update({ ...readPersonalDevice(), ready: true });
      localStorage.setItem(deviceKey("archride.personal.v1"), JSON.stringify({ prefs: next.prefs, items: next.items, active: next.active }));
      setState(next);
      return true;
      };
      return navigator.locks ? await navigator.locks.request("archride:personal", commit) : commit();
    } catch {
      setError("This browser could not save your change. Storage may be full or blocked.");
      return false;
    } finally { setBusy(false); }
  };
  const savePreferences = (prefs: TravelPreferences) => {
    if (!validTravel(prefs)) { setError("Check the preference values and try again."); return Promise.resolve(false); }
    return change(s => ({ ...s, prefs }));
  };
  const saveItem = (destination: PlaceRef, origin: PlaceRef | null = null, name?: string, position = state.items.length) => {
    const key = savedKey(origin, destination);
    const item: SavedItem = {
      id: crypto.randomUUID(), key, kind: origin ? "journey" : "stop",
      name: (name || (origin ? `${origin.name} to ${destination.name}` : destination.name)).trim().slice(0, 80),
      origin: origin ? placeRef(origin) : null, destination: placeRef(destination), position, updatedAt: new Date().toISOString(),
    };
    if (!validSaved(item)) return Promise.resolve(false);
    if (state.items.length >= 200) { setError("Remove an old saved item before adding another."); return Promise.resolve(false); }
    return change(s => s.items.some(i => i.key === key) ? s : ({ ...s, items: [...s.items, item].slice(0, 200).sort((a, b) => a.position - b.position) }));
  };
  const editItem = (item: SavedItem, patch: { name?: string; position?: number }) => {
    const next = { ...item, ...patch, name: (patch.name ?? item.name).trim(), updatedAt: new Date().toISOString() };
    if (!validSaved(next)) { setError("Use a name from 1 to 80 characters."); return Promise.resolve(false); }
    return change(s => ({ ...s, items: s.items.map(i => i.id === item.id ? next : i).sort((a, b) => a.position - b.position) }));
  };
  const removeItem = (item: SavedItem) => change(s => ({ ...s, items: s.items.filter(i => i.id !== item.id) }));
  const moveItem = (item: SavedItem, delta: -1 | 1) => change(s => {
    const items = [...s.items], index = items.findIndex(i => i.id === item.id), target = index + delta;
    if (index < 0 || target < 0 || target >= items.length) return s;
    [items[index], items[target]] = [items[target], items[index]];
    return { ...s, items: items.map((i, position) => ({ ...i, position })) };
  });
  const setActive = (active: ActiveTrip | null) => active && !validActive(active) ? Promise.resolve(false) : change(s => ({ ...s, active }));
  return { ...state, scope: "device", source: "device" as const, error, busy, savePreferences, saveItem, editItem, removeItem, moveItem, setActive, reload };
}
export function PersonalProvider({ children }: { children: React.ReactNode }) {
  return <Context.Provider value={usePersonalState()}>{children}</Context.Provider>;
}
