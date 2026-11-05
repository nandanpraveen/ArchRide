// Dashboard fallback for environments where the Supabase CLI cannot reach the network.
// Creates single-file function bundles with explicit, pinned npm: imports for Deno.
import {createRequire} from "node:module";
import {mkdir, readFile} from "node:fs/promises";
const require = createRequire(import.meta.url);
const {build} = require(require.resolve("esbuild", {paths:[require.resolve("tsx")]}));
const pkg = JSON.parse(await readFile("package.json", "utf8"));
await mkdir("/tmp/archride-deploy", {recursive:true});
for (const name of ["walking-route", "delete-account", "predictor-update", "health", "transit-ingest"]) {
  await build({entryPoints:[`supabase/functions/${name}/index.ts`], outfile:`/tmp/archride-deploy/${name}.txt`, bundle:true, platform:"neutral", format:"esm", target:"es2022", plugins:[{
    name:"pinned-deno-imports", setup(build) {build.onResolve({filter:/^[^./]/}, args => {
      if (args.path.startsWith("node:") || args.path.startsWith("npm:")) return {path:args.path, external:true};
      const parts=args.path.split("/"), root=args.path.startsWith("@") ? parts.slice(0,2).join("/") : parts[0];
      const version=pkg.dependencies[root];
      if (!version) return;
      return {path:`npm:${root}@${version}${args.path.slice(root.length)}`, external:true};
    });}
  }]});
}
