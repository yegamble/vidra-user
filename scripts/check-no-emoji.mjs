#!/usr/bin/env node
// Emoji / glyph-as-icon guard (DR2 of the design refresh).
//
// House rule: icons are SVG only — never emoji or symbol glyphs. The refresh
// vendored a typed feather-style set at components/icons, and the icon sweep
// replaced the last 5 emoji/glyph call sites (👍👎 ⚑ ★☆ ✓, plus a stray ＋).
// This guard keeps them dead: it scans the product source (components/ and app/)
// for any character in the pictographic / dingbat / fullwidth-form ranges that
// are only ever used as makeshift icons, and fails CI if one reappears.
//
// It deliberately does NOT ban the documented typography that the design uses as
// text: · (U+00B7) separators, … (U+2026), × (U+00D7) multipliers/dimensions,
// ← → (U+2190/2192) keycaps and prose arrows, — – dashes, and curly quotes —
// none of those fall in the banned ranges below.
//
// Run: node scripts/check-no-emoji.mjs   (exit 1 on any violation)
// Importable: `import { findEmojiViolations } from "./check-no-emoji.mjs"`.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, "..");

// Directories scanned (product source only — not e2e fixtures or configs).
const SCAN_DIRS = ["components", "app"];
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

// Codepoint ranges that are icon-glyphs, never legitimate text in this app.
// [start, end] inclusive.
const BANNED_RANGES = [
  [0x2600, 0x26ff], // Miscellaneous Symbols (★ ☆ ⚑ ⚐ ⚠ ☀ ☁ …)
  [0x2700, 0x27bf], // Dingbats (✓ ✔ ✗ ✂ ✏ ➜ …)
  [0x2b00, 0x2bff], // Misc Symbols & Arrows (⭐ …)
  [0x1f000, 0x1faff], // Emoji planes (😀 👍 👎 🎬 …)
  [0xfe00, 0xfe0f], // Variation selectors (emoji presentation)
  [0x200d, 0x200d], // Zero-width joiner (emoji sequences)
  [0xff01, 0xff5e], // Fullwidth ASCII forms (＋ ＊ … — glyph icons, not real text)
];

function isBanned(codepoint) {
  return BANNED_RANGES.some(([lo, hi]) => codepoint >= lo && codepoint <= hi);
}

function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (EXTENSIONS.has(full.slice(full.lastIndexOf(".")))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Scan the product source for banned icon-glyph characters.
 * @param {string} root repo root (defaults to the vidra-user root)
 * @returns {{file:string,line:number,column:number,char:string,codepoint:string}[]}
 */
export function findEmojiViolations(root = REPO_ROOT) {
  const files = [];
  for (const d of SCAN_DIRS) {
    const abs = join(root, d);
    try {
      walk(abs, files);
    } catch {
      // A scan dir may not exist in some checkout; skip it.
    }
  }
  const violations = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      // Iterate by codepoint so astral emoji (surrogate pairs) read correctly.
      let column = 0;
      for (const ch of lines[i]) {
        column++;
        const cp = ch.codePointAt(0);
        if (isBanned(cp)) {
          violations.push({
            file: relative(root, file),
            line: i + 1,
            column,
            char: ch,
            codepoint: `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`,
          });
        }
      }
    }
  }
  return violations;
}

// CLI entry point (only when invoked directly, not when imported by a test).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const violations = findEmojiViolations();
  if (violations.length) {
    console.error(
      `\n❌ Emoji/glyph icons found in ${SCAN_DIRS.join("/ ")}/ — icons must be SVG (components/icons):`,
    );
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line}:${v.column}  ${v.char} ${v.codepoint}`);
    }
    console.error(
      "\nReplace the glyph with a component from components/icons (add one if the design needs it).",
    );
    process.exit(1);
  }
  console.log("✅ No emoji/glyph icons in components/ or app/ — SVG icons only.");
}
