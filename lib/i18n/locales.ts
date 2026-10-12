// Locale registry + negotiation. Pure and catalog-free, so client code (a
// language picker) can import it without bundling translations (./catalogs).

export const DEFAULT_LOCALE = "en";
export const LOCALE_COOKIE = "vidra_locale";

export type LocaleRegistry = Record<string, { name: string; complete: boolean }>;

/**
 * Every locale with a shipped catalog. `complete: false` (a partial or
 * machine-drafted catalog) may be CHOSEN, but nothing switches a viewer into
 * it automatically: a half-translated UI nobody asked for is worse than an
 * English one. Flip it once a native speaker has reviewed a full catalog.
 */
export const LOCALES = {
  en: { name: "English", complete: true },
  fr: { name: "Français", complete: false },
} as const satisfies LocaleRegistry;

export type Locale = keyof typeof LOCALES;

const RTL = new Set(["ar", "ckb", "dv", "fa", "he", "ps", "sd", "ug", "ur", "yi"]);

export function localeDir(locale: string): "ltr" | "rtl" {
  return RTL.has(locale.split("-")[0].toLowerCase()) ? "rtl" : "ltr";
}

/** The shipped locale for a BCP 47 tag (or POSIX "fr_FR"): exact, then shorter prefixes. */
export function matchLocale(
  tag: string | null | undefined,
  { onlyComplete = false, locales = LOCALES as LocaleRegistry } = {},
): Locale | null {
  const subtags = (tag ?? "").trim().toLowerCase().replace(/_/g, "-").split("-");
  for (let n = subtags.length; n > 0; n--) {
    const code = Object.keys(locales).find((c) => c.toLowerCase() === subtags.slice(0, n).join("-"));
    if (code && (!onlyComplete || locales[code].complete)) return code as Locale;
  }
  return null;
}

/** Accept-Language tags, best first (q order; header order breaks ties). */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  return (header ?? "")
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.split(";").map((s) => s.trim());
      const q = params.find((p) => p.toLowerCase().startsWith("q="));
      return { tag, index, weight: q ? Number(q.slice(2)) || 0 : 1 };
    })
    .filter(({ tag, weight }) => tag && tag !== "*" && weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
    .map(({ tag }) => tag);
}

type Signals = { cookie?: string | null; acceptLanguage?: string | null; instanceDefault?: string | null };

/**
 * Order: the viewer's explicit choice (cookie) → Accept-Language → instance
 * default → en. Explicit choices may pick any shipped locale, the automatic
 * sources only complete ones. A saved per-user preference would come first,
 * but vidra-core's User has no locale field; once it does, the client should
 * mirror it into the cookie (the session is restored in the browser, so the
 * server render never knows the user).
 */
export function resolveLocale(signals: Signals, locales: LocaleRegistry = LOCALES): Locale {
  const auto = { onlyComplete: true, locales };
  return (
    matchLocale(signals.cookie, { locales }) ??
    parseAcceptLanguage(signals.acceptLanguage).map((tag) => matchLocale(tag, auto)).find(Boolean) ??
    matchLocale(signals.instanceDefault, auto) ??
    DEFAULT_LOCALE
  );
}
