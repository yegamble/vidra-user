#!/usr/bin/env node
// Frontend <-> backend contract drift guard.
//
// The vidra-user API client (lib/api/*.ts) hand-maintains the paths AND the HTTP
// methods it calls on vidra-core. Field shapes are covered elsewhere: lib/api/generated.ts
// is generated from the spec (scripts/codegen.mjs) and contract-ci proves it byte-for-byte
// fresh. What codegen does NOT prove is that a hand-written wrapper calls the right path
// with the right verb — generated.ts is types only, and the wrappers are not typed against
// its operations. So this script guards two things:
//
//   1. every /api/ path the frontend references exists in the spec. Path params compare
//      structurally ({id} vs {videoId} both normalize to {}), so it is name-agnostic.
//   2. every apiRequest() call site uses a method the spec actually defines for that path.
//      A wrapper that PUTs to a POST-only path used to pass silently: the path existed,
//      and nothing looked at the verb.
//
// (2) needs a real scan, not a line regex. 98 of the ~160 explicit-method call sites put
// `method:` on a LATER LINE than the path, so the line-scoped idiom used for (1) would
// read every one of them as a GET and report ~98 phantom mismatches. findApiRequestCalls
// therefore walks balanced parens with string/template awareness. Omitted method means
// GET (lib/api/client.ts defaults it), which is why absence is a claim, not a skip.
//
// Transports that bypass apiRequest (the XHR upload helper, bare fetch in
// fetchVideoDownload/fetchAttachment, the resumable PUT, the SSE subscriber) are still
// covered by (1) wherever their URL is a literal; they are out of scope for (2) because
// their method is not expressed as an apiRequest option.
//
// Since the monorepo split, vidra-core is a SEPARATE repo. The spec is resolved in
// priority order:
//   1. $OPENAPI_PATH        — explicit path (CI downloads the public spec to here)
//   2. ../vidra-core/...     — sibling checkout (meta-repo `bootstrap.sh` layout)
//   3. ../../vidra-core/...  — legacy in-monorepo layout
//
// Run: npm run check:contract                     (exit 1 on drift)
//   or OPENAPI_PATH=/path/to/openapi.yaml npm run check:contract
//
// NOTE ON THE LOCAL SPEC: the sibling ../vidra-core checkout is pinned DETACHED at a
// release tag by the meta repo, while contract-ci checks out vidra-core@main. Those are
// different specs, so a path merged into core after the pinned tag fails HERE and passes
// in CI. That is not your change breaking — the summary line prints which spec answered.

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

// Collapse path params and trailing noise so /api/v1/videos/{id} (backend) and
// /api/v1/videos/${encodeURIComponent(id)} (frontend) compare equal.
export function normalize(p) {
  return p
    .replace(/\$\{[^}]*\}/g, "{}") // ${encodeURIComponent(id)} -> {}
    .replace(/\{[^}]*\}/g, "{}") // {id} / {handle} -> {}
    .replace(/\?.*$/, "") // strip any query string
    .replace(/\/+$/, ""); // strip trailing slash
}

// Path keys under `paths:` are the only 2-space-indented `/...:` lines in the spec, and
// operation keys the only 4-space-indented verbs under them. Both are indentation
// contracts with a GENERATED file, which is what makes the regexes safe: every one of the
// spec's path keys and operation keys matches these shapes, with no quoted keys and no
// inline maps. A hand-edited spec could break that; the empty-set guard below catches it.
export function backendOperations(yaml) {
  const ops = new Map(); // normalized path -> Set<METHOD>
  let inPaths = false;
  let current = null;
  for (const line of yaml.split("\n")) {
    if (/^paths:\s*$/.test(line)) {
      inPaths = true;
      continue;
    }
    if (!inPaths) continue;
    if (/^\S/.test(line)) break; // next top-level key ends the section
    const pathKey = line.match(/^ {2}(\/\S+):\s*$/);
    if (pathKey) {
      current = normalize(pathKey[1]);
      if (!ops.has(current)) ops.set(current, new Set());
      continue;
    }
    const verb = current && line.match(/^ {4}(get|post|put|patch|delete|head|options):\s*$/);
    if (verb) ops.get(current).add(verb[1].toUpperCase());
  }
  return ops;
}

// Walk from the "(" at `open` to its matching ")", skipping over string and template
// literals (and the expressions nested inside `${}`) so that a brace or paren INSIDE a
// path template cannot unbalance the scan. Returns null on an unterminated call.
function sliceCall(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i++;
      for (; i < src.length; i++) {
        if (src[i] === "\\") {
          i++;
          continue;
        }
        if (quote === "`" && src[i] === "$" && src[i + 1] === "{") {
          let d = 1;
          i += 2;
          for (; i < src.length && d > 0; i++) {
            if (src[i] === "{") d++;
            else if (src[i] === "}") d--;
          }
          i--;
          continue;
        }
        if (src[i] === quote) break;
      }
      continue;
    }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      depth--;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  return null;
}

// Split an argument list on TOP-LEVEL commas only (a comma inside the options object or
// inside a template expression is not an argument separator).
function topLevelArgs(args) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < args.length; i++) {
    const c = args[i];
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i++;
      for (; i < args.length; i++) {
        if (args[i] === "\\") {
          i++;
          continue;
        }
        if (quote === "`" && args[i] === "$" && args[i + 1] === "{") {
          let d = 1;
          i += 2;
          for (; i < args.length && d > 0; i++) {
            if (args[i] === "{") d++;
            else if (args[i] === "}") d--;
          }
          i--;
          continue;
        }
        if (args[i] === quote) break;
      }
      continue;
    }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) {
      out.push(args.slice(start, i));
      start = i + 1;
    }
  }
  out.push(args.slice(start));
  return out;
}

/**
 * Every apiRequest() call site in one source file, with the method it will actually send.
 *
 * @returns {{path:string|null,norm:string|null,method:string,file:string,line:number,raw:string}[]}
 */
export function findApiRequestCalls(content, file) {
  const calls = [];
  // Optional generic type args: apiRequest<VideoResponse>( ... )
  const callRe = /\bapiRequest\s*(?:<[\s\S]*?>)?\s*\(/g;
  let m;
  while ((m = callRe.exec(content)) !== null) {
    const open = m.index + m[0].length - 1;
    // client.ts's own `export async function apiRequest<T>(path, opts)` is the definition,
    // not a call site. Skip it by looking back for the declaration keyword.
    const before = content.slice(Math.max(0, m.index - 40), m.index);
    if (/\bfunction\s*$/.test(before)) continue;
    const args = sliceCall(content, open);
    if (args === null) continue;
    const parts = topLevelArgs(args);
    const line = content.slice(0, m.index).split("\n").length;

    // --- path (first argument)
    let pathArg = parts[0] ? parts[0].trim() : "";
    // One hop of local `const <ident> = `...`` resolution: the DM-attachment wrapper
    // builds its path into a const and passes the identifier (it needs the same value
    // twice, for apiRequest and for the XHR fallback).
    if (/^[A-Za-z_$][\w$]*$/.test(pathArg)) {
      const decl = new RegExp("const\\s+" + pathArg + "\\s*=\\s*([`'\"])([\\s\\S]*?)\\1");
      const d = content.slice(0, m.index).match(decl);
      pathArg = d ? d[1] + d[2] + d[1] : "";
    }
    const hit = pathArg.match(/\/api\/[^\s?'"`]*/);

    // --- method (second argument). The union is closed and string-literal only
    // (lib/api/client.ts), and an omitted method means GET.
    const opts = parts[1] || "";
    const mm = opts.match(/\bmethod\s*:\s*["'](GET|POST|PUT|PATCH|DELETE)["']/);
    calls.push({
      path: hit ? hit[0] : null,
      norm: hit ? normalize(hit[0]) : null,
      method: mm ? mm[1] : "GET",
      file,
      line,
      raw: hit ? hit[0] : pathArg.slice(0, 40),
    });
  }
  return calls;
}

// Every string/template literal containing /api/ in the frontend API client.
export function frontendRefs(content, file) {
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

// CLI entry point (only when invoked directly, not when imported by a test).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

function main() {
// Deliberately inside main(): a test importing this module for its pure functions must
// never be able to exit the host process.
if (!existsSync(OPENAPI)) {
  console.error(`contract: OpenAPI spec not found at ${OPENAPI}`);
  console.error(
    "Set OPENAPI_PATH, or check out vidra-core as a sibling directory " +
      "(the meta-repo `bootstrap.sh` does this). CI downloads it from the public " +
      "vidra-core repo.",
  );
  process.exit(2);
}

const operations = backendOperations(readFileSync(OPENAPI, "utf8"));
const backend = new Set(operations.keys());
if (backend.size === 0) {
  console.error("contract: could not extract any paths from", OPENAPI);
  process.exit(2);
}

const refs = [];
const calls = [];
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
  const src = readFileSync(join(API_DIR, f), "utf8");
  refs.push(...frontendRefs(src, f));
  calls.push(...findApiRequestCalls(src, f));
}

const missing = refs.filter((r) => !backend.has(r.norm));
const referenced = new Set(refs.map((r) => r.norm));

// Only call sites whose path we resolved AND whose path the spec knows: an unresolved
// path is not a method claim, and a missing path is already reported above — reporting
// it twice would just make one break look like two.
const wrongMethod = calls.filter(
  (c) => c.norm && operations.has(c.norm) && !operations.get(c.norm).has(c.method),
);

const opCount = [...operations.values()].reduce((n, set) => n + set.size, 0);
console.log(
  `contract: ${backend.size} backend paths / ${opCount} operations (${OPENAPI}), ` +
    `${referenced.size} paths and ${calls.length} apiRequest call sites in the frontend client`,
);
if (missing.length) {
  console.error("\n❌ Frontend calls paths that do NOT exist in vidra-core's openapi.yaml:");
  for (const r of missing) console.error(`  ${r.raw}  (${r.file}:${r.line})  -> normalized ${r.norm}`);
  console.error("\nFix the frontend path, or update the backend OpenAPI spec to match.");
}
if (wrongMethod.length) {
  console.error("\n❌ Frontend calls a path with a method the spec does NOT define for it:");
  for (const c of wrongMethod) {
    const allowed = [...operations.get(c.norm)].sort().join(", ") || "(none)";
    console.error(`  ${c.method} ${c.raw}  (${c.file}:${c.line})  -> spec allows: ${allowed}`);
  }
  console.error("\nFix the wrapper's method, or add the operation to the backend OpenAPI spec.");
}
if (missing.length || wrongMethod.length) process.exit(1);

console.log(
  "✅ Every frontend-referenced path exists in the backend OpenAPI contract, " +
    "and every apiRequest call uses a method that path defines.",
);
}
