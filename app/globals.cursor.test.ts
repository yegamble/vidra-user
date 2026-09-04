import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Tailwind v3's preflight gave every `button` and `[role="button"]` a pointer
// cursor. v4 dropped that rule to match the bare browser default, so upgrading
// silently left every button in the app showing the ordinary arrow — nothing
// in the UI looked clickable. The rule has to live here because it is a
// preflight replacement, not a per-component style, and no component test can
// observe a stylesheet, so these assertions are what fences the regression.
// Comments are stripped first: this file explains the rule in prose that names
// both "@layer base" and the declaration, and a parser that reads prose would
// pass on the comment alone while the real rule was gone.
const css = readFileSync(join(__dirname, "globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

// The @layer base block, matched by brace counting so a nested rule inside it
// (a media query, a :not() chain) cannot end the match early.
function layerBase(source: string): string {
  const start = source.indexOf("@layer base");
  if (start === -1) return "";
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return "";
}

describe("globals.css interactive cursor", () => {
  const base = layerBase(css);

  it("restores the pointer cursor Tailwind v4 preflight no longer supplies", () => {
    expect(base).toMatch(/button/);
    expect(base).toMatch(/\[role="button"\]/);
    expect(base).toMatch(/cursor:\s*pointer/);
  });

  it("keeps the rule inside @layer base so cursor-* utilities still win", () => {
    // Unlayered CSS beats every layered rule regardless of source order, and
    // Tailwind's utilities are layered. A bare `button { cursor: pointer }`
    // here would therefore be unoverridable by `cursor-wait` / `cursor-default`
    // on a specific button — the same trap that made a `position` declaration
    // in this file beat Tailwind's `sticky`.
    const bare = css.replace(/@layer\s+base\s*\{[\s\S]*?\n\}/, "");
    expect(bare).not.toMatch(/cursor:\s*pointer/);
  });

  it("does not offer a pointer on disabled controls", () => {
    expect(base).toMatch(/:not\(:disabled\)/);
  });
});
