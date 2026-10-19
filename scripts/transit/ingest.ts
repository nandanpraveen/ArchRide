import pg from "pg";
import { assert, FeedError } from "./model";
import { runIngestion } from "./run";
async function main() {
  assert(
    process.env.TRANSIT_SOURCE_APPROVED === "true",
    "source_approval_required",
  );
  assert(process.env.TRANSIT_DATABASE_URL, "database_url_required");
  const db = new pg.Client({
    connectionString: process.env.TRANSIT_DATABASE_URL,
    connectionTimeoutMillis: 10000,
    statement_timeout: 60000,
    application_name: "archride-transit",
  });
  await db.connect();
  try {
    const result = await runIngestion(db);
    console.log(JSON.stringify(result));
    if (result.failed) process.exitCode = 1;
  } finally {
    await db.end();
  }
}
main().catch((e) => {
  console.error(
    JSON.stringify({
      outcome: "failed",
      code: e instanceof FeedError ? e.code : "worker_failed",
    }),
  );
  process.exitCode = 1;
});
