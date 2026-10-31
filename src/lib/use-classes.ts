"use client";
import { useCallback, useEffect, useState } from "react";
import type { ClassEntry } from "@/app/classes/next-class";
import {
  classFromRow,
  readDeviceClasses,
  rowFromDraft,
  validateClass,
  writeDeviceClasses,
  type ClassDraft,
} from "@/lib/classes";
import { createClient } from "@/lib/supabase/browser-client";

export type ClassesSource = "account" | "device";
export type ClassesStatus = "loading" | "ready" | "error";

const SAVE_FAILED = "Your change could not be saved. Check your connection and try again.";
const DEVICE_SAVE_FAILED = "This browser could not save your schedule on this device.";

// Signed-in students sync through Supabase (private by row-level security). Guests and
// anyone whose account service is unreachable keep a schedule on this device only.
async function findAccount(): Promise<{ signedIn: boolean; unavailable: boolean }> {
  try {
    const { data, error } = await createClient().auth.getUser();
    if (data.user) return { signedIn: true, unavailable: false };
    const missingSession = !error || error.name === "AuthSessionMissingError" || error.status === 401 || error.status === 403;
    return { signedIn: false, unavailable: !missingSession };
  } catch {
    return { signedIn: false, unavailable: true };
  }
}

export function useClasses() {
  const [classes, setClasses] = useState<ClassEntry[]>([]);
  const [status, setStatus] = useState<ClassesStatus>("loading");
  const [source, setSource] = useState<ClassesSource>("device");
  const [accountUnavailable, setAccountUnavailable] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const account = await findAccount();
      if (cancelled) return;
      setAccountUnavailable(account.unavailable);
      if (!account.signedIn) {
        setSource("device");
        setClasses(readDeviceClasses());
        setStatus("ready");
        return;
      }
      setSource("account");
      try {
        const { data, error } = await createClient()
          .from("classes")
          .select("*")
          .order("starts_at")
          .order("created_at");
        if (cancelled) return;
        if (error) {
          setStatus("error");
          return;
        }
        setClasses(data.map(classFromRow));
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [revision]);

  const reload = useCallback(() => {
    setStatus("loading");
    setRevision((value) => value + 1);
  }, []);

  const fail = useCallback((message: string) => {
    setSaveError(message);
    return false;
  }, []);

  const add = useCallback(
    async (draft: ClassDraft) => {
      setSaveError("");
      if (Object.keys(validateClass(draft)).length) return fail("Check the class details and try again.");
      if (source === "device") {
        const next = [...readDeviceClasses(), { ...draft, title: draft.title.trim(), id: crypto.randomUUID() }];
        if (!writeDeviceClasses(next)) return fail(DEVICE_SAVE_FAILED);
        setClasses(next);
        return true;
      }
      try {
        const { data, error } = await createClient().from("classes").insert(rowFromDraft(draft)).select().single();
        if (error) return fail(SAVE_FAILED);
        setClasses((current) => [...current, classFromRow(data)]);
        return true;
      } catch {
        return fail(SAVE_FAILED);
      }
    },
    [fail, source],
  );

  const update = useCallback(
    async (id: string, draft: ClassDraft) => {
      setSaveError("");
      if (Object.keys(validateClass(draft)).length) return fail("Check the class details and try again.");
      if (source === "device") {
        const next = readDeviceClasses().map((item) => (item.id === id ? { ...draft, title: draft.title.trim(), id } : item));
        if (!writeDeviceClasses(next)) return fail(DEVICE_SAVE_FAILED);
        setClasses(next);
        return true;
      }
      try {
        const { data, error } = await createClient().from("classes").update(rowFromDraft(draft)).eq("id", id).select().single();
        if (error) return fail(SAVE_FAILED);
        setClasses((current) => current.map((item) => (item.id === id ? classFromRow(data) : item)));
        return true;
      } catch {
        return fail(SAVE_FAILED);
      }
    },
    [fail, source],
  );

  const remove = useCallback(
    async (id: string) => {
      setSaveError("");
      if (source === "device") {
        const next = readDeviceClasses().filter((item) => item.id !== id);
        if (!writeDeviceClasses(next)) return fail(DEVICE_SAVE_FAILED);
        setClasses(next);
        return true;
      }
      try {
        const { error } = await createClient().from("classes").delete().eq("id", id);
        if (error) return fail(SAVE_FAILED);
        setClasses((current) => current.filter((item) => item.id !== id));
        return true;
      } catch {
        return fail(SAVE_FAILED);
      }
    },
    [fail, source],
  );

  return { classes, status, source, accountUnavailable, saveError, add, update, remove, reload };
}
