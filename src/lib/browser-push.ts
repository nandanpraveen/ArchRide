import type { PushState } from "./push-reminders";

const KEY = "archride.browser-push.v1";
const CHANGED = "archride:push-changed";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
export type PushDevice = { token: string; enabled: boolean; syncedAt?: string; expiresAt?: string };
export function readPushDevice(): PushDevice | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "null");
    return value && /^[a-f0-9]{64}$/.test(value.token) && typeof value.enabled === "boolean" ? value : null;
  } catch { return null; }
}
function saveDevice(device: PushDevice) {
  localStorage.setItem(KEY, JSON.stringify(device));
  window.dispatchEvent(new Event(CHANGED));
}
export function browserPushSupport(): "supported" | "install" | "unsupported" {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
  if (ios && !standalone) return "install";
  return window.isSecureContext && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window ? "supported" : "unsupported";
}
export async function pushRegistration() {
  const registration = await navigator.serviceWorker.register(`${basePath}/notifications-sw.js`, { scope: `${basePath}/`, updateViaCache: "none" });
  if (registration.active) return registration;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Notification setup took too long. Try again.")), 10000)),
  ]);
}
async function pushRequest(body?: unknown) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Browser reminders are not available yet. Try again later.");
  const response = await fetch(`${url}/functions/v1/push-reminders`, {
    method: body ? "POST" : "GET", headers: { apikey: key, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(response.status === 429 ? "Too many changes. Wait a minute and retry." : "Couldn’t save browser reminders. Check your connection and retry.");
  return response.json();
}
let pending: Promise<unknown> = Promise.resolve();
async function serialized<T>(operation: () => Promise<T>): Promise<T> {
  if (navigator.locks) return await navigator.locks.request("archride:browser-push", operation);
  const next = pending.then(operation, operation);
  pending = next.catch(() => {});
  return next;
}
export function syncBrowserPush(state: PushState) {
  return serialized(async () => {
    const device = readPushDevice();
    if (!device?.enabled) return;
    const registration = await pushRegistration();
    const subscription = await registration.pushManager.getSubscription();
    if (Notification.permission !== "granted" || !subscription) throw new Error("Browser permission changed. Enable notifications again.");
    const result = await pushRequest({ action: "sync", token: device.token, subscription: subscription.toJSON(), state });
    // Disabling in another tab takes precedence over an older sync response.
    if (readPushDevice()?.enabled) saveDevice({ ...device, ...result });
  });
}
export async function enableBrowserPush(state: PushState, permission: Promise<NotificationPermission>) {
  if (await permission !== "granted") throw new Error("Notifications are blocked. Allow ArchRide in your browser’s site settings, then retry.");
  await serialized(async () => {
    const { publicKey } = await pushRequest();
    const registration = await pushRegistration();
    const bytes = Uint8Array.from(atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")), character => character.charCodeAt(0));
    const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
    const device = readPushDevice() ?? { token: Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join(""), enabled: false };
    // Persist the capability before sending so even a failed response can be revoked.
    saveDevice({ ...device, enabled: false });
    const result = await pushRequest({ action: "sync", token: device.token, subscription: subscription.toJSON(), state });
    saveDevice({ ...device, ...result, enabled: true });
  });
}
export async function disableBrowserPush() {
  const device = readPushDevice();
  if (device) saveDevice({ ...device, enabled: false });
  await serialized(async () => {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration(`${basePath}/`);
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription && !await subscription.unsubscribe()) throw new Error("Couldn’t turn off browser notifications. Retry before clearing data.");
      for (const notification of await registration?.getNotifications() ?? []) notification.close();
    }
    if (device) await pushRequest({ action: "disable", token: device.token });
    localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(CHANGED));
  });
}
