import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CATALOGS } from "./catalogs";
import { en } from "./en";
import { LOCALES } from "./locales";

// Catalog guardrails. The type system already rejects an unknown key in a
// catalog literal and in a t("…") call; these tests hold the same lines at
// runtime, so a catalog that stops being a literal (a JSON import, a generated
// file) or a call the compiler cannot see through still fails the unit gate.

const ROOT = path.resolve(__dirname, "../..");
const PLACEHOLDER = /\{(\w+)\}/g;

function placeholders(message: unknown): Set<string> {
  const text = typeof message === "string" ? message : Object.values(message as object).join(" ");
  return new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1]));
}

const translated = Object.entries(CATALOGS).filter(([locale]) => locale !== "en");

describe("locale catalogs", () => {
  it("ships a catalog for every registered locale, and only those", () => {
    expect(Object.keys(CATALOGS).sort()).toEqual(Object.keys(LOCALES).sort());
  });

  it.each(translated)("%s: every key is an en key", (_locale, catalog) => {
    const unknown = Object.keys(catalog).filter((key) => !(key in en));
    expect(unknown).toEqual([]);
  });

  it.each(translated)("%s: uses no placeholder en does not supply", (_locale, catalog) => {
    for (const [key, message] of Object.entries(catalog)) {
      const allowed = placeholders(en[key as keyof typeof en]);
      for (const name of placeholders(message)) {
        expect(allowed.has(name), `${key} uses {${name}}`).toBe(true);
      }
    }
  });

  it("gives every plural message an `other` form", () => {
    for (const catalog of [en, ...translated.map(([, c]) => c)]) {
      for (const [key, message] of Object.entries(catalog)) {
        if (typeof message !== "string") expect(message, key).toHaveProperty("other");
      }
    }
  });
});

// Every literal key passed to the translator anywhere in the app must exist in
// en. Convention: the translator is always bound to `t` (const t = useT() /
// await getT()), so a file that imports the i18n seam and calls t("…") is in
// scope.
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe("t() call sites", () => {
  const keys = new Map<string, string>();
  for (const file of ["app", "components", "lib"].flatMap((d) => sourceFiles(path.join(ROOT, d)))) {
    const source = readFileSync(file, "utf8");
    if (!/from "@\/(lib\/i18n|components\/I18nProvider)/.test(source)) continue;
    for (const m of source.matchAll(/\bt\(\s*["'`]([\w.-]+)["'`]/g)) {
      keys.set(m[1], path.relative(ROOT, file));
    }
  }

  it("finds the call sites (the scan is not vacuous)", () => {
    expect(keys.size).toBeGreaterThan(30);
  });

  it("uses only keys the en catalog defines", () => {
    const missing = [...keys].filter(([key]) => !(key in en)).map(([key, file]) => `${file}: ${key}`);
    expect(missing).toEqual([]);
  });
});
