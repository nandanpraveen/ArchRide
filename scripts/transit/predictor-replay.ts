import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  evaluateUpdate,
  type SegmentObservation,
  type SegmentModel,
} from "../../src/lib/predictor";
const [input, output, current] = process.argv.slice(2);
if (!input || !output)
  throw new Error(
    "Usage: pnpm predictor:replay observations.json output.json [current-model.json]",
  );
const bytes = await readFile(input, "utf8"),
  data = JSON.parse(bytes) as SegmentObservation[];
if (!Array.isArray(data)) throw new Error("Expected an observation array.");
const previous = current
  ? (JSON.parse(await readFile(current, "utf8")) as SegmentModel)
  : undefined;
const result = evaluateUpdate(data, previous),
  datasetVersion = createHash("sha256").update(bytes).digest("hex"),
  version = createHash("sha256")
    .update(JSON.stringify(result.model))
    .digest("hex");
await writeFile(
  output,
  JSON.stringify({ ...result, datasetVersion, version }, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    { output, version, datasetVersion, report: result.report },
    null,
    2,
  ),
);
