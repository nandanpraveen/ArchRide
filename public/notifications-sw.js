/* Notifications only: deliberately no fetch handler or offline cache. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

const appRoot = () => new URL(self.registration.scope);
function notificationURL(link) {
  const root = appRoot();
  if (typeof link !== "string" || !/^\/([^/\\]|$)/.test(link)) return root.href;
  const url = new URL(root.pathname.replace(/\/$/, "") + link, root.origin);
  return url.origin === root.origin && url.pathname.startsWith(root.pathname) ? url.href : root.href;
}
self.addEventListener("push", event => {
  event.waitUntil((async () => {
    let draft;
    try { draft = event.data.json(); } catch { return; }
    if (!draft || typeof draft.title !== "string" || typeof draft.body !== "string" ||
        typeof draft.dedupeKey !== "string" || !(Date.parse(draft.expiresAt) > Date.now()) ||
        (draft.deliverBy !== undefined && !(draft.deliverBy > Date.now()))) return;
    await self.registration.showNotification(draft.title.slice(0, 80), {
      body: draft.body.slice(0, 200), tag: draft.dedupeKey.slice(0, 200),
      icon: new URL("icons/app-192.png", appRoot()).href,
      data: { url: notificationURL(draft.link), expiresAt: draft.expiresAt },
    });
    for (const client of await self.clients.matchAll({ type: "window", includeUncontrolled: true })) {
      if (client.url.startsWith(self.registration.scope)) client.postMessage({ type: "archride:push", notification: draft });
    }
  })());
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const root = appRoot();
    const candidate = new URL(event.notification.data?.url || root.href, root);
    const url = Date.parse(event.notification.data?.expiresAt) > Date.now() && candidate.origin === root.origin && candidate.pathname.startsWith(root.pathname) ? candidate.href : new URL("notifications/", root).href;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find(client => client.url.startsWith(root.href));
    if (existing) { await existing.navigate(url); await existing.focus(); }
    else await self.clients.openWindow(url);
  })());
});
