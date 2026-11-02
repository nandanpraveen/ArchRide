// Pure admin decision logic. No server-only, cookies, or network imports, so it can be
// unit tested with `node --test`. guard.ts wires in the real Supabase dependencies.

export type AdminCheck =
  | { ok: true; userId: string }
  | { ok: false; reason: "signed-out" | "forbidden" | "unavailable" };

export type AdminDeps = {
  // Mirrors getAccount() in src/app/get-user.ts. Only the id is ever used.
  getAccount: () => Promise<{ user: { id: string } | null; unavailable: boolean }>;
  // Mirrors the is_admin() database function.
  isAdmin: () => Promise<{ data: unknown; error: unknown }>;
};

const unavailable: AdminCheck = { ok: false, reason: "unavailable" };

export async function evaluateAdmin(deps: AdminDeps): Promise<AdminCheck> {
  let account: Awaited<ReturnType<AdminDeps["getAccount"]>>;
  try {
    account = await deps.getAccount();
  } catch {
    return unavailable;
  }
  if (account.unavailable) return unavailable;
  if (!account.user) return { ok: false, reason: "signed-out" };

  try {
    const { data, error } = await deps.isAdmin();
    if (error) return unavailable;
    // Strict comparison: only the boolean true from the database grants access.
    return data === true
      ? { ok: true, userId: account.user.id }
      : { ok: false, reason: "forbidden" };
  } catch {
    return unavailable;
  }
}
