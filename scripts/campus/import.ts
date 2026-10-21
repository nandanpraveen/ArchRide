import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { campusSql, normalizeCampus } from "./catalog";
import { fetchCampusSource } from "./source";

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.length !== 3 || args[0] !== "--fetch" || args[1] !== "--output" || !args[2]) {
    console.log("Usage: node --import tsx scripts/campus/import.ts --fetch --output /absolute/new/output-directory\nReads public UGA sources and writes review artifacts. Never connects to a database or applies SQL.");
    if (!args.includes("--help")) process.exitCode = 1;
    return;
  }
  const output = path.resolve(args[2]);
  const { snapshot, evidence } = await fetchCampusSource();
  const catalog = normalizeCampus(snapshot);
  // Refuse overwriting earlier evidence. Apply the SQL separately only after reviewing its report.
  await mkdir(output);
  await writeFile(path.join(output, "catalog.json"), JSON.stringify(catalog, null, 2) + "\n", { flag: "wx" });
  await writeFile(path.join(output, "catalog.sql"), campusSql(catalog), { flag: "wx" });
  await writeFile(path.join(output, "source-evidence.json"), JSON.stringify(evidence, null, 2) + "\n", { flag: "wx" });
  await writeFile(path.join(output, "selected-properties.json"), JSON.stringify({ spatialReference: { wkid: 4326 }, fetchedAt: snapshot.fetchedAt, source: evidence.authorityChain, features: snapshot.properties }, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ outcome: "review_artifacts_written", output, ...catalog.report }));
}

main().catch((error) => {
  console.error(JSON.stringify({ outcome: "failed", code: error instanceof Error ? error.message : "campus_import_failed" }));
  process.exitCode = 1;
});
