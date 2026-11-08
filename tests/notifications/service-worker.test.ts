import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

test("a push with no open app shows a native notification; clicks stay inside /archride/", async () => {
  const handlers = new Map<string, (event: unknown) => void>();
  const shown: { title: string; options: { data: { url: string; expiresAt: string } } }[] = [];
  const opened: string[] = [];
  const worker = { addEventListener: (type: string, handler: (event: unknown) => void) => handlers.set(type, handler), registration: { scope: "https://example.test/archride/", showNotification: async (title: string, options: typeof shown[number]["options"]) => { shown.push({ title, options }); } }, clients: { matchAll: async () => [], openWindow: async (url: string) => { opened.push(url); } } };
  runInNewContext(await readFile("public/notifications-sw.js", "utf8"), { self: worker, URL, Date });
  const run = async (type: string, event: object) => { let pending: Promise<unknown> | undefined; handlers.get(type)!({ ...event, waitUntil: (promise: Promise<unknown>) => { pending = promise; } }); await pending; };
  const draft = { title: "Time to leave for your bus", body: "Campus Loop at Tate", dedupeKey: "leave:one", link: "/plan?to=mlc", expiresAt: new Date(Date.now() + 60000).toISOString() };
  await run("push", { data: { json: () => draft } });
  assert.equal(shown[0].title, draft.title);
  assert.equal(shown[0].options.data.url, "https://example.test/archride/plan?to=mlc");
  await run("notificationclick", { notification: { close: () => {}, data: shown[0].options.data } });
  assert.equal(opened[0], "https://example.test/archride/plan?to=mlc");
  await run("push", { data: { json: () => ({ ...draft, link: "//evil.test" }) } });
  assert.equal(shown[1].options.data.url, "https://example.test/archride/");
  await run("push", { data: { json: () => ({ ...draft, expiresAt: new Date(Date.now() - 1).toISOString() }) } });
  assert.equal(shown.length, 2);
});
