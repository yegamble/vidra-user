#!/usr/bin/env node
// Copies the @matrix-org/olm runtime (olm.js + olm.wasm) into public/olm so the
// browser can load it via a <script> tag at runtime (see lib/e2ee/olm-loader.ts).
// Turbopack cannot bundle the package (its emscripten glue references Node's fs),
// so serving it statically is the supported path. Runs as `prebuild`.
//
// The copied files are gitignored (they are vendored binaries), so this keeps
// them out of git while making them present for any build/runtime. Defensive:
// a missing package is a skip, never a build failure — the mocked CI gate never
// loads the real runtime.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const src = join(root, "node_modules", "@matrix-org", "olm");
const dst = join(root, "public", "olm");

try {
  if (!existsSync(join(src, "olm.js"))) {
    console.log("copy-olm-wasm: @matrix-org/olm not installed; skipping");
    process.exit(0);
  }
  mkdirSync(dst, { recursive: true });
  for (const file of ["olm.js", "olm.wasm"]) {
    copyFileSync(join(src, file), join(dst, file));
  }
  console.log("copy-olm-wasm: copied olm runtime to public/olm");
} catch (err) {
  console.log(`copy-olm-wasm: skipped (${err.message})`);
}
