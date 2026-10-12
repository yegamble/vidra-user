import { logger } from "@/lib/logger";

import { en, type MessageKey } from "./en";
import { DEFAULT_LOCALE, type Locale } from "./locales";

/*
 * The translator. ONE entry point per side, both reading the same
 * per-request locale, so a page's server and client halves never disagree:
 *   - server components: `const { t } = await getI18n()` (./locale.server)
 *   - client components: `const t = useT()` (components/I18nProvider)
 * Keys are `MessageKey` and each key's vars are typed from its placeholders,
 * so an unknown key or a missing/misspelled var is a compile error.
 */

/** CLDR plural forms chosen by `vars.count`; `other` is mandatory. */
export type PluralMessage = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
export type Message = string | PluralMessage;
/** A translated catalog: any subset of the en keys. */
export type Messages = Partial<Record<MessageKey, Message>>;

type Placeholders<S> = S extends `${string}{${infer Name}}${infer Rest}` ? Name | Placeholders<Rest> : never;
/** A message's vars: its {placeholders}, plus `count` for a plural. */
type VarNames<M> = M extends string ? Placeholders<M> : Placeholders<M[keyof M]> | "count";
type VarsArgs<K extends MessageKey> = [VarNames<(typeof en)[K]>] extends [never]
  ? []
  : [vars: Record<VarNames<(typeof en)[K]>, string | number>];
export type Translate = <K extends MessageKey>(key: K, ...vars: VarsArgs<K>) => string;

const PLACEHOLDER = /\{(\w+)\}/g;
const warned = new Set<string>();
const intlCache = new Map<Locale, { plural: Intl.PluralRules; number: Intl.NumberFormat }>();

/** Intl.PluralRules + NumberFormat for a locale, built once per process. */
export function intlFor(locale: Locale) {
  let intl = intlCache.get(locale);
  if (!intl) intlCache.set(locale, (intl = { plural: new Intl.PluralRules(locale), number: new Intl.NumberFormat(locale) }));
  return intl;
}

/**
 * A `t()` bound to one locale. A key `messages` lacks renders the en text,
 * with en's plural rules and number format — never the raw key. Only `count`
 * is number-formatted (a year or an id must not be grouped). A missing var is
 * left as its literal `{name}` token rather than throwing.
 */
export function createTranslator(locale: Locale, messages: Messages = {}): Translate {
  const translate = (key: MessageKey, vars?: Record<string, string | number>): string => {
    const translated = messages[key];
    if (translated === undefined && locale !== DEFAULT_LOCALE && process.env.NODE_ENV === "development") {
      if (!warned.has(locale + key)) logger.warn("i18n: missing translation", { locale, key });
      warned.add(locale + key);
    }
    const message: Message = translated ?? en[key];
    const intl = intlFor(translated === undefined ? DEFAULT_LOCALE : locale);
    const template =
      typeof message === "string" ? message : (message[intl.plural.select(Number(vars?.count))] ?? message.other);
    if (!vars) return template;
    return template.replace(PLACEHOLDER, (whole, name: string) => {
      const value = vars[name];
      if (value === undefined) return whole;
      return name === "count" && typeof value === "number" ? intl.number.format(value) : String(value);
    });
  };
  return translate as Translate;
}

/** English-only, for code outside React. Components use useT() / getI18n(). */
export const t: Translate = createTranslator(DEFAULT_LOCALE);

export type { MessageKey };
