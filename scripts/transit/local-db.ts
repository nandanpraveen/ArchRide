import { PGlite } from "@electric-sql/pglite";
import { readdir, readFile } from "node:fs/promises";
import type { DB } from "./store";
export async function localDatabase() {
  const engine = new PGlite();
  await engine.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema public, auth to anon, authenticated, service_role;`);
  for (const file of (await readdir("supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await engine.exec(await readFile("supabase/migrations/" + file, "utf8"));
  // pg and PGlite expose equivalent query/rows here, but use different generic constraints.
  const db: DB = {
    query: async <T extends Record<string, unknown>>(
      sql: string,
      params?: unknown[],
    ) => ({ rows: (await engine.query<T>(sql, params)).rows }),
  };
  return { engine, db };
}
