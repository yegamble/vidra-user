import { en, type MessageKey } from "./en";

/*
 * Lightweight i18n seam (P12 readiness — NOT a full translation system).
 *
 * The app currently ships one locale (en). `t()` looks a key up in the default
 * catalog and interpolates `{placeholder}` vars, so every string routed through
 * it is externalized and ready to be swapped per-locale later by replacing the
 * catalog behind `activeCatalog`. Because the key type is `MessageKey`, calling
 * `t()` with an unknown key is a compile error — the catalog can never silently
 * drift from its call sites.
 *
 * When real localization lands, this module gains a locale resolver + async
 * catalog loading; call sites (`t("some.key", vars)`) do not change.
 */

export type MessageVars = Record<string, string | number>;

/** The catalog `t()` reads from. Single-locale today; swappable per-locale later. */
const activeCatalog: Record<MessageKey, string> = en;

const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * Translate a catalog key, interpolating `{name}` placeholders from `vars`.
 * A missing placeholder var is left as its literal `{name}` token rather than
 * throwing, so a partial call still renders something readable.
 */
export function t(key: MessageKey, vars?: MessageVars): string {
  const template = activeCatalog[key];
  if (!vars) return template;
  return template.replace(PLACEHOLDER, (whole, name: string) => {
    const value = vars[name];
    return value === undefined ? whole : String(value);
  });
}

export type { MessageKey };
