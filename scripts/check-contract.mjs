#!/usr/bin/env node
// Frontend <-> backend contract drift guard.
//
// The vidra-user API client (lib/api/*.ts) hand-maintains the paths it calls on
// vidra-core. Nothing currently fails when the backend renames/removes an endpoint
// the frontend still calls (types.ts is marked PROVISIONAL, no codegen). This script
// is the interim guard: it asserts every /api/ path the frontend references exists
// in vidra-core's OpenAPI spec. Path params are compared structurally ({id} vs
// {videoId} both normalize to {}), so it is name-agnostic and not flaky. It does NOT
// check HTTP methods or field shapes — that needs generated types (a later step).
//
// Since the monorepo split, vidra-core is a SEPARATE repo. The spec is resolved in
// priority order:
//   1. $OPENAPI_PATH        — explicit path (CI downloads the public spec to here)
//   2. ../vidra-core/...     — sibling checkout (meta-repo `bootstrap.sh` layout)
//   3. ../../vidra-core/...  — legacy in-monorepo layout
//
// Run: node scripts/check-contract.mjs            (exit 1 on drift)
//   or OPENAPI_PATH=/path/to/openapi.yaml node scripts/check-contract.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const userRoot = resolve(here, ".."); // vidra-user repo root

function resolveOpenapi() {
  if (process.env.OPENAPI_PATH) return resolve(process.env.OPENAPI_PATH);
  const candidates = [
    resolve(userRoot, "..", "vidra-core", "api", "openapi.yaml"),
    resolve(userRoot, "..", "..", "vidra-core", "api", "openapi.yaml"),
  ];
  return candidates.find((c) => existsSync(c)) ?? candidates[0];
}

const OPENAPI = resolveOpenapi();
const API_DIR = join(userRoot, "lib", "api");

if (!existsSync(OPENAPI)) {
  console.error(`contract: OpenAPI spec not found at ${OPENAPI}`);
  console.error(
    "Set OPENAPI_PATH, or check out vidra-core as a sibling directory " +
      "(the meta-repo `bootstrap.sh` does this). CI downloads it from the public " +
      "vidra-core repo.",
  );
  process.exit(2);
}

// Collapse path params and trailing noise so /api/v1/videos/{id} (backend) and
// /api/v1/videos/${encodeURIComponent(id)} (frontend) compare equal.
function normalize(p) {
  return p
    .replace(/\$\{[^}]*\}/g, "{}") // ${encodeURIComponent(id)} -> {}
    .replace(/\{[^}]*\}/g, "{}") // {id} / {handle} -> {}
    .replace(/\?.*$/, "") // strip any query string
    .replace(/\/+$/, ""); // strip trailing slash
}

// Path keys under `paths:` are the only 2-space-indented `/...:` lines in the spec.
function backendPaths(yaml) {
  const set = new Set();
  let inPaths = false;
  for (const line of yaml.split("\n")) {
    if (/^paths:\s*$/.test(line)) {
      inPaths = true;
      continue;
    }
    if (inPaths && /^\S/.test(line)) inPaths = false; // next top-level key ends the section
    const m = inPaths && line.match(/^ {2}(\/\S+):\s*$/);
    if (m) set.add(normalize(m[1]));
  }
  return set;
}

// Every string/template literal containing /api/ in the frontend API client.
function frontendRefs(content, file) {
  const refs = [];
  content.split("\n").forEach((line, i) => {
    const strRe = /(['"`])((?:\\.|(?!\1).)*?)\1/g;
    let m;
    while ((m = strRe.exec(line)) !== null) {
      const hit = m[2].match(/\/api\/[^\s?'"`]*/);
      if (hit) refs.push({ norm: normalize(hit[0]), raw: hit[0], file, line: i + 1 });
    }
  });
  return refs;
}

const backend = backendPaths(readFileSync(OPENAPI, "utf8"));
if (backend.size === 0) {
  console.error("contract: could not extract any paths from", OPENAPI);
  process.exit(2);
}

const refs = [];
for (const f of readdirSync(API_DIR)) {
  if (!f.endsWith(".ts") || f.endsWith(".test.ts")) continue;
  // generated.ts is machine-generated FROM the spec (scripts/codegen.mjs) and its
  // freshness is proven byte-for-byte by the codegen step in contract-ci, so every
  // path KEY in it exists in the spec by construction — scanning it adds no real
  // coverage. It DOES yield false positives: an operation's @description prose can
  // embed an inline /api/... reference (e.g. "…continue with PUT
  // /api/v1/uploads/{upload_id}/chunks/{n}."), which the string scanner extracts
  // with its trailing sentence punctuation and can't match. Skip it; the
  // meaningful guard is over the hand-maintained client files.
  if (f === "generated.ts") continue;
  refs.push(...frontendRefs(readFileSync(join(API_DIR, f), "utf8"), f));
}

const missing = refs.filter((r) => !backend.has(r.norm));
const referenced = new Set(refs.map((r) => r.norm));

console.log(
  `contract: ${backend.size} backend paths (${OPENAPI}), ${referenced.size} referenced by the frontend client`,
);
if (missing.length) {
  console.error("\n❌ Frontend calls paths that do NOT exist in vidra-core's openapi.yaml:");
  for (const r of missing) console.error(`  ${r.raw}  (${r.file}:${r.line})  -> normalized ${r.norm}`);
  console.error("\nFix the frontend path, or update the backend OpenAPI spec to match.");
  process.exit(1);
}

console.log("✅ Every frontend-referenced path exists in the backend OpenAPI contract.");
