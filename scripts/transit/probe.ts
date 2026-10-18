// Read-only upstream probe + real ingestion into an isolated, disposable PostgreSQL engine.
import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fetchFeed } from "./fetch";
import { endpoints, staticCatalog, normalize, context } from "./model";
import { localDatabase } from "./local-db";
import { saveStatic, saveRealtime } from "./store";
async function main() {
  const { engine, db } = await localDatabase();
  try {
    const checkedAt = new Date().toISOString();
    const bytes = await fetchFeed(endpoints.static);
    const c = staticCatalog(bytes);
    await saveStatic(db, c);
    await saveStatic(db, c);
    const feeds = [];
    for (const feed of ["vehicles", "arrivals", "alerts"] as const) {
      const b = await fetchFeed(endpoints[feed]);
      const r = normalize(feed, b, context(c));
      const first = await saveRealtime(db, feed, r);
      const replay = await saveRealtime(db, feed, r);
      feeds.push({
        feed,
        url: endpoints[feed],
        bytes: b.length,
        sha256: createHash("sha256").update(b).digest("hex"),
        sourceTimestamp: r.timestamp,
        entities: r.entityCount,
        normalizedRows: r.rows.length,
        rejected: r.rejected,
        first,
        replay,
      });
    }
    const evidence = {
      checkedAt,
      environment: "Isolated PGlite PostgreSQL, not hosted Supabase",
      credentialsRequired: false,
      static: {
        url: endpoints.static,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        counts: Object.fromEntries(
          Object.entries(c).map(([t, r]) => [t, r.length]),
        ),
      },
      feeds,
      limits:
        "A successful read does not establish polling quotas or expand the provider email permission. No recurring upstream polling was enabled.",
    };
    await writeFile(
      "docs/transit/access-evidence.json",
      JSON.stringify(evidence, null, 2) + "\n",
    );
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await engine.close();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "probe_failed");
  process.exitCode = 1;
});
