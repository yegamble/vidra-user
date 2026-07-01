#!/usr/bin/env node
// Regenerate lib/api/generated.ts from vidra-core's OpenAPI spec (the source of
// truth). lib/api/types.ts derives all its named types from this file, so drift
// is caught by TypeScript. Run `npm run codegen` after the backend contract
// changes, and commit the result. CI (contract-ci) runs this against the spec
// fetched from the public vidra-core repo and fails if the committed file is stale.
//
// Spec resolution matches scripts/check-contract.mjs:
//   1. $OPENAPI_PATH        — explicit path (CI sets this to the fetched spec)
//   2. ../vidra-core/...     — sibling checkout (meta-repo bootstrap layout)
//   3. ../../vidra-core/...  — legacy in-monorepo layout

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, ".."); // vidra-user repo root

function resolveSpec() {
  if (process.env.OPENAPI_PATH) return resolve(process.env.OPENAPI_PATH);
  const candidates = [
    resolve(root, "..", "vidra-core", "api", "openapi.yaml"),
    resolve(root, "..", "..", "vidra-core", "api", "openapi.yaml"),
  ];
  return candidates.find((c) => existsSync(c)) ?? candidates[0];
}

const spec = resolveSpec();
if (!existsSync(spec)) {
  console.error(`codegen: OpenAPI spec not found at ${spec}`);
  console.error("Set OPENAPI_PATH or check out vidra-core as a sibling directory.");
  process.exit(2);
}

const out = resolve(root, "lib", "api", "generated.ts");
// Use the locally-installed binary (pinned devDependency) so output is
// deterministic — the CI freshness check compares byte-for-byte.
const bin = resolve(root, "node_modules", ".bin", "openapi-typescript");

execFileSync(bin, [spec, "-o", out], { stdio: "inherit" });
console.log(`codegen: wrote ${out}\n         from ${spec}`);
