import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCALE,
  LOCALES,
  localeDir,
  matchLocale,
  parseAcceptLanguage,
  resolveLocale,
} from "./locales";

// A registry in which fr is complete, so the automatic sources can pick it.
// The shipped registry marks fr as a partial seed (see LOCALES), which the
// automatic sources must skip — that rule has its own test below.
const FR_COMPLETE = {
  en: { name: "English", complete: true },
  fr: { name: "Français", complete: true },
} as const;

describe("parseAcceptLanguage", () => {
  it("orders tags by q, keeping header order on ties", () => {
    expect(parseAcceptLanguage("de;q=0.5, fr-CA, en;q=0.8, es")).toEqual(["fr-CA", "es", "en", "de"]);
  });

  it("reads the q parameter case-insensitively", () => {
    expect(parseAcceptLanguage("de;Q=0.2, fr;Q=0.9")).toEqual(["fr", "de"]);
  });

  it("drops the wildcard, q=0 and malformed weights, and survives empty input", () => {
    expect(parseAcceptLanguage("*, fr;q=0, de;q=abc, it")).toEqual(["it"]);
    expect(parseAcceptLanguage("")).toEqual([]);
    expect(parseAcceptLanguage(null)).toEqual([]);
  });
});

describe("matchLocale", () => {
  it("matches exactly, case-insensitively, then by truncating subtags", () => {
    expect(matchLocale("fr")).toBe("fr");
    expect(matchLocale("FR-ca")).toBe("fr");
    expect(matchLocale("en-Latn-US")).toBe("en");
    // POSIX-style separators (fr_FR) show up in hand-set cookies.
    expect(matchLocale("fr_FR")).toBe("fr");
  });

  it("returns null for a locale with no shipped catalog, or no tag at all", () => {
    expect(matchLocale("de-DE")).toBeNull();
    expect(matchLocale("")).toBeNull();
    expect(matchLocale(undefined)).toBeNull();
  });

  it("skips partial catalogs when only complete ones may be negotiated", () => {
    expect(matchLocale("fr", { onlyComplete: true })).toBeNull();
    expect(matchLocale("fr", { onlyComplete: true, locales: FR_COMPLETE })).toBe("fr");
  });
});

describe("resolveLocale", () => {
  it("prefers the cookie over Accept-Language and the instance default", () => {
    expect(
      resolveLocale(
        { cookie: "fr", acceptLanguage: "en", instanceDefault: "en" },
        FR_COMPLETE,
      ),
    ).toBe("fr");
  });

  it("ignores a cookie naming a locale with no catalog", () => {
    expect(resolveLocale({ cookie: "de", acceptLanguage: "fr" }, FR_COMPLETE)).toBe("fr");
  });

  it("walks Accept-Language in q order to the first shipped locale", () => {
    expect(resolveLocale({ acceptLanguage: "de-DE, fr;q=0.9, en;q=0.1" }, FR_COMPLETE)).toBe("fr");
  });

  it("falls back to the instance default, then en", () => {
    expect(resolveLocale({ acceptLanguage: "de", instanceDefault: "fr" }, FR_COMPLETE)).toBe("fr");
    expect(resolveLocale({ acceptLanguage: "de", instanceDefault: "ja" }, FR_COMPLETE)).toBe(DEFAULT_LOCALE);
    expect(resolveLocale({})).toBe("en");
  });

  it("never auto-negotiates a partial catalog, but honours an explicit choice of one", () => {
    // Shipped registry: fr is a machine-drafted seed. A French browser must not
    // be switched into a half-translated UI it never asked for…
    expect(LOCALES.fr.complete).toBe(false);
    expect(resolveLocale({ acceptLanguage: "fr-FR", instanceDefault: "fr" })).toBe("en");
    // …but a viewer who picked it (the cookie) gets it.
    expect(resolveLocale({ cookie: "fr", acceptLanguage: "en" })).toBe("fr");
  });
});

describe("localeDir", () => {
  it("is rtl for right-to-left scripts and ltr otherwise", () => {
    expect(localeDir("ar")).toBe("rtl");
    expect(localeDir("he-IL")).toBe("rtl");
    expect(localeDir("fa")).toBe("rtl");
    expect(localeDir("en")).toBe("ltr");
    expect(localeDir("fr")).toBe("ltr");
  });
});
