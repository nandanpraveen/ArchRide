"use client";
import { deviceKey } from "@/lib/device-storage";
import { useEffect, useState } from "react";
import { Alert, Link, Stack, Typography } from "@mui/material";
import { publicTransitClient } from "@/lib/supabase/public";
type Notice = { id: string; title: string; body: string; route_ids: string[]; stop_ids: string[]; valid_from: string; valid_until: string; source_url: string; updated_at: string };
export function ManualNotices({ routeIds = [], stopIds = [], scoped = false }: { routeIds?: string[]; stopIds?: string[]; scoped?: boolean }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [dismissed, setDismissed] = useState<string[]>(() => {
    try { if (typeof window === "undefined") return []; const stored = JSON.parse(sessionStorage.getItem(deviceKey("archride-dismissed-notices")) ?? "[]"); return Array.isArray(stored) ? stored.filter(v => typeof v === "string").slice(-100) : []; } catch { return []; }
  });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const db = publicTransitClient(); if (!db) return;
    let active = true, request: AbortController | null = null;
    async function refresh() {
      if (document.hidden) return;
      request?.abort(); request = new AbortController();
      try {
        const { data, error } = await db!.from("manual_notices").select("id,title,body,route_ids,stop_ids,valid_from,valid_until,source_url,updated_at").order("valid_until").limit(100).abortSignal(request.signal);
        if (active && !request.signal.aborted) { setNow(Date.now()); setNotices(error ? [] : data ?? []); }
      } catch { if (active) setNotices([]); }
    }
    void refresh();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const refreshTimer = setInterval(() => void refresh(), 60_000);
    const visible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { active = false; request?.abort(); clearInterval(timer); clearInterval(refreshTimer); document.removeEventListener("visibilitychange", visible); };
  }, []);
  const noticeKey = (n: Notice) => `${n.id}:${n.updated_at}`;
  const dismiss = (n: Notice) => { const next = [...dismissed, noticeKey(n)].slice(-100); setDismissed(next); try { sessionStorage.setItem(deviceKey("archride-dismissed-notices"), JSON.stringify(next)); } catch { /* Dismissal still works for this view. */ } };
  const selected = notices.filter(n => !dismissed.includes(noticeKey(n)) && Date.parse(n.valid_from) <= now && Date.parse(n.valid_until) > now && ((!scoped && !routeIds.length && !stopIds.length) || (!n.route_ids.length && !n.stop_ids.length) || n.route_ids.some(id => routeIds.includes(id)) || n.stop_ids.some(id => stopIds.includes(id))));
  if (!selected.length) return null;
  return <Stack spacing={1.5} aria-label="Maintainer notices">{selected.map(n => <Alert key={n.id} severity="info" onClose={() => dismiss(n)}><Typography component="h2" variant="body2" sx={{ fontWeight: 700 }}>{n.title}</Typography><Typography variant="body2">{n.body}</Typography><Typography variant="caption">Maintainer notice. Valid until {new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", dateStyle: "short", timeStyle: "short" }).format(new Date(n.valid_until))} campus time. <Link href={n.source_url} target="_blank" rel="noopener noreferrer">Official source</Link></Typography></Alert>)}</Stack>;
}
