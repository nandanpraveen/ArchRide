"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { authClient } from "@/lib/supabase/auth";
import { setDeviceAccount } from "@/lib/device-storage";
import { clearLocation } from "@/lib/location";
import { clearWalkingCache } from "@/lib/planner/walking";

type State = { status: "checking" | "signed-out" | "signed-in" | "unavailable"; user: User | null };
const Context = createContext<(State & { refresh: () => Promise<boolean>; signOut: () => Promise<boolean> }) | null>(null);
export function useAuth() {
  const context = useContext(Context);
  if (!context) throw new Error("AuthProvider missing");
  return context;
}
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ status: "checking", user: null });
  const generation = useRef(0), currentAccount = useRef<string | null>(null);
  const pending = useRef<Promise<boolean> | null>(null);
  const invalidate = useCallback(() => { generation.current++; pending.current = null; }, []);
  const refresh = useCallback(() => {
    if (pending.current) return pending.current;
    const check = async () => {
      const stamp = ++generation.current;
      const client = authClient();
      if (!client) { setState({ status: "unavailable", user: null }); return false; }
      try {
        const { data: session } = await client.auth.getSession();
        if (stamp !== generation.current) return false;
        if (!session.session) { setState({ status: "signed-out", user: null }); return false; }
        if (session.session.user.id !== currentAccount.current) setState({ status: "checking", user: null });
        const { data, error } = await client.auth.getUser(session.session.access_token);
        if (stamp !== generation.current) return false;
        if (error || !data.user || data.user.is_anonymous) {
          setState({ status: error && (!error.status || error.status >= 500) ? "unavailable" : "signed-out", user: null });
          return false;
        }
        if (currentAccount.current !== data.user.id) { clearLocation(); clearWalkingCache(); }
        setDeviceAccount(data.user.id);
        currentAccount.current = data.user.id;
        setState({ status: "signed-in", user: data.user });
        return true;
      } catch {
        if (stamp === generation.current) setState({ status: "unavailable", user: null });
        return false;
      }
    };
    const request = check();
    pending.current = request;
    void request.finally(() => { if (pending.current === request) pending.current = null; });
    return request;
  }, []);
  useEffect(() => {
    const client = authClient();
    let timer: ReturnType<typeof setTimeout>;
    const { data } = client?.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        invalidate();
        currentAccount.current = null;
        clearLocation(); clearWalkingCache();
        setState({ status: "signed-out", user: null });
      } else {
        if (event === "SIGNED_IN") invalidate();
        clearTimeout(timer);
        timer = setTimeout(() => void refresh(), 0);
      }
    }) ?? { data: null };
    queueMicrotask(() => void refresh());
    const expired = () => { invalidate(); setState({ status: "signed-out", user: null }); };
    window.addEventListener("archride:session-expired", expired);
    return () => { invalidate(); clearTimeout(timer); data?.subscription.unsubscribe(); window.removeEventListener("archride:session-expired", expired); };
  }, [refresh, invalidate]);
  const signOut = async () => {
    const client = authClient();
    if (!client) return false;
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) return false;
    generation.current++;
    currentAccount.current = null;
    setState({ status: "signed-out", user: null });
    return true;
  };
  return <Context.Provider value={{ ...state, refresh, signOut }}>{children}</Context.Provider>;
}
