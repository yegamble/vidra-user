import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { findEmojiViolations } from "@/scripts/check-no-emoji.mjs";

// The emoji/glyph-icon guard (scripts/check-no-emoji.mjs) is wired into
// `npm run ci` as `lint:icons`. This mirrors it in the unit suite: the product
// source must stay glyph-free, and the detector itself must actually catch a
// planted emoji (so a broken guard can't silently pass).
describe("no emoji/glyph icons in product source", () => {
  it("finds zero banned glyphs across components/ and app/", () => {
    const violations = findEmojiViolations();
    // A readable failure message listing every offender, if any slip back in.
    const detail = violations.map((v) => `${v.file}:${v.line} ${v.char} ${v.codepoint}`).join("\n");
    expect(violations, detail).toEqual([]);
  });

  const tmp = mkdtempSync(join(tmpdir(), "vidra-emoji-guard-"));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it("detects banned glyphs (emoji, dingbat, misc-symbol, fullwidth) when present", () => {
    mkdirSync(join(tmp, "components"), { recursive: true });
    // Build the offending glyphs from codepoints so this test file itself stays
    // glyph-free (the guard scans test files too — see the clean-source case).
    const bad = [0x1f44d, 0x2713, 0x2605, 0xff0b].map((c) => String.fromCodePoint(c)).join("");
    writeFileSync(
      join(tmp, "components", "Bad.tsx"),
      `export const Bad = () => <span>${bad}</span>;\n`,
      "utf8",
    );
    const codepoints = findEmojiViolations(tmp).map((v) => v.codepoint);
    expect(codepoints).toContain("U+1F44D"); // thumbs-up emoji
    expect(codepoints).toContain("U+2713"); // dingbat check
    expect(codepoints).toContain("U+2605"); // black star
    expect(codepoints).toContain("U+FF0B"); // fullwidth plus
  });

  it("does not flag the documented typography the design uses as text", () => {
    mkdirSync(join(tmp, "app"), { recursive: true });
    // Allowed: U+00B7 · U+2026 … U+00D7 × U+2190 ← U+2192 → U+2014 — U+2013 –.
    const ok = [0x00b7, 0x2026, 0x00d7, 0x2190, 0x2192, 0x2014, 0x2013]
      .map((c) => String.fromCodePoint(c))
      .join(" ");
    writeFileSync(
      join(tmp, "app", "Ok.tsx"),
      `export const Ok = () => <span>{${JSON.stringify(ok)}}</span>;\n`,
      "utf8",
    );
    // Scanning only the app/ fixture here would also re-scan components/Bad.tsx
    // from the previous test, so assert none of the typography codepoints appear.
    const found = findEmojiViolations(tmp).map((v) => v.codepoint);
    for (const cp of ["U+00B7", "U+2026", "U+00D7", "U+2190", "U+2192", "U+2014", "U+2013"]) {
      expect(found).not.toContain(cp);
    }
  });
});
