#!/usr/bin/env node
/**
 * Bundle foyer-lock for download: Node + viem, one file, no extra npm on the customer machine.
 */
import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

await esbuild.build({
  absWorkingDir: path.join(here, ".."),
  entryPoints: ["scripts/lock-broker.mjs"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: "scripts/foyer-lock.bundle.mjs",
  banner: { js: "#!/usr/bin/env node" },
  logLevel: "info",
});
