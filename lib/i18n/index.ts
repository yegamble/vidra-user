import { logger } from "@/lib/logger";

import { en, type MessageKey } from "./en";
import { DEFAULT_LOCALE, type Locale } from "./locales";

/*
 * The translator, one implementation for both component kinds:
 *   - server components: `const { t } = await getI18n()` (./locale.server)
 *   - client components: `const t = useT()` (components/I18nProvider)
 * Both read the same per-request locale, so a page's server and client halves
 * never disagree. Keys are `MessageKey`: an unknown key is a compile error.
 */

/** CLDR plural forms chosen by `vars.count`; `other` is mandatory. */
export type PluralMessage = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
export type Message = string | PluralMessage;
/** A translated catalog: any subset of the en keys. */
export type Messages = Partial<Record<MessageKey, Message>>;
export type MessageVars = Record<string, string | number>;
export type Translate = (key: MessageKey, vars?: MessageVars) => string;

const PLACEHOLDER = /\{(\w+)\}/g;
const warned = new Set<string>();

const formatters = (locale: string) => ({ plural: new Intl.PluralRules(locale), number: new Intl.NumberFormat(locale) });

/**
 * A `t()` bound to one locale. A key `messages` lacks renders the en text,
 * with en's plural rules and number format — never the raw key. A missing
 * placeholder var is left as its literal `{name}` token rather than throwing.
 */
export function createTranslator(locale: Locale, messages: Messages = {}): Translate {
  const own = formatters(locale);
  const fallback = locale === DEFAULT_LOCALE ? own : formatters(DEFAULT_LOCALE);
  return (key, vars) => {
    const translated = messages[key];
    if (translated === undefined && locale !== DEFAULT_LOCALE && process.env.NODE_ENV === "development") {
      if (!warned.has(locale + key)) logger.warn("i18n: missing translation", { locale, key });
      warned.add(locale + key);
    }
    const message: Message = translated ?? en[key];
    const fmt = translated === undefined ? fallback : own;
    const template =
      typeof message === "string" ? message : (message[fmt.plural.select(Number(vars?.count))] ?? message.other);
    if (!vars) return template;
    return template.replace(PLACEHOLDER, (whole, name: string) => {
      const value = vars[name];
      return value === undefined ? whole : typeof value === "number" ? fmt.number.format(value) : value;
    });
  };
}

/** English-only, for code outside React. Components use useT() / getI18n(). */
export const t: Translate = createTranslator(DEFAULT_LOCALE);

export type { MessageKey };
