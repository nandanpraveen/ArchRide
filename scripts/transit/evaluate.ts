import pg from "pg";
import { readFile } from "node:fs/promises";
if (!process.env.TRANSIT_DATABASE_URL)
  throw new Error(
    "TRANSIT_DATABASE_URL is required for trusted evaluation; never use a browser key.",
  );
const db = new pg.Client({
  connectionString: process.env.TRANSIT_DATABASE_URL,
  statement_timeout: 60_000,
});
await db.connect();
try {
  await db.query("begin isolation level repeatable read read only");
  const query = await readFile(
    new URL("./evaluation-report.sql", import.meta.url),
    "utf8",
  );
  const result = await db.query(query);
  console.log(JSON.stringify(result.rows[0].report, null, 2));
  await db.query("commit");
} finally {
  await db.end();
}
