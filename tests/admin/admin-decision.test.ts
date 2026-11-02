import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateAdmin, type AdminDeps } from "../../src/lib/admin/decision";

function makeDeps(overrides: Partial<AdminDeps> = {}) {
  const calls = { isAdmin: 0 };
  const deps: AdminDeps = {
    getAccount: async () => ({ user: { id: "user-1" }, unavailable: false }),
    isAdmin: async () => {
      calls.isAdmin += 1;
      return { data: false, error: null };
    },
    ...overrides,
  };
  return { deps, calls };
}

test("guest is signed-out and the role is never queried", async () => {
  const { deps, calls } = makeDeps({
    getAccount: async () => ({ user: null, unavailable: false }),
  });
  assert.deepEqual(await evaluateAdmin(deps), { ok: false, reason: "signed-out" });
  assert.equal(calls.isAdmin, 0);
});

test("an expired or invalid token resolves to no user and is treated as signed-out", async () => {
  // get-user.ts maps 401/403 and missing-session errors to { user: null, unavailable: false }.
  const { deps } = makeDeps({
    getAccount: async () => ({ user: null, unavailable: false }),
  });
  assert.equal((await evaluateAdmin(deps)).ok, false);
});

test("auth outage fails closed as unavailable without querying the role", async () => {
  const { deps, calls } = makeDeps({
    getAccount: async () => ({ user: null, unavailable: true }),
  });
  assert.deepEqual(await evaluateAdmin(deps), { ok: false, reason: "unavailable" });
  assert.equal(calls.isAdmin, 0);
});

test("a thrown identity lookup fails closed", async () => {
  const { deps } = makeDeps({
    getAccount: async () => {
      throw new Error("network down");
    },
  });
  assert.deepEqual(await evaluateAdmin(deps), { ok: false, reason: "unavailable" });
});

test("ordinary signed-in user is forbidden", async () => {
  const { deps } = makeDeps();
  assert.deepEqual(await evaluateAdmin(deps), { ok: false, reason: "forbidden" });
});

test("forged client role in user_metadata or app_metadata grants nothing", async () => {
  const forged = {
    id: "user-1",
    user_metadata: { role: "admin", is_admin: true, admin: true },
    app_metadata: { role: "admin" },
  };
  const { deps } = makeDeps({
    getAccount: async () => ({ user: forged, unavailable: false }),
  });
  assert.deepEqual(await evaluateAdmin(deps), { ok: false, reason: "forbidden" });
});

test("trusted admin is allowed and the user id is returned", async () => {
  const { deps } = makeDeps({
    isAdmin: async () => ({ data: true, error: null }),
  });
  assert.deepEqual(await evaluateAdmin(deps), { ok: true, userId: "user-1" });
});

test("a role lookup error fails closed", async () => {
  const { deps } = makeDeps({
    isAdmin: async () => ({ data: true, error: { message: "boom" } }),
  });
  assert.deepEqual(await evaluateAdmin(deps), { ok: false, reason: "unavailable" });
});

test("a thrown role lookup fails closed", async () => {
  const { deps } = makeDeps({
    isAdmin: async () => {
      throw new Error("timeout");
    },
  });
  assert.deepEqual(await evaluateAdmin(deps), { ok: false, reason: "unavailable" });
});

test("only the boolean true grants access; truthy lookalikes are forbidden", async () => {
  for (const data of ["true", 1, {}, [], "admin", null, undefined]) {
    const { deps } = makeDeps({ isAdmin: async () => ({ data, error: null }) });
    const result = await evaluateAdmin(deps);
    assert.equal(result.ok, false, `expected ${String(data)} to be denied`);
  }
});
