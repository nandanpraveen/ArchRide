import { test as base } from "@playwright/test";
import { mockAuth } from "../auth/fixtures";
export * from "@playwright/test";
export const test = base.extend<{signedIn: boolean}>({
  signedIn: [true,{option:true}],
  context: async ({context,signedIn},run) => { await mockAuth(context,signedIn); await run(context); },
});
