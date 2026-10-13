"use client";

import { createContext, useContext, useMemo } from "react";

import { createTranslator, type Messages, type Translate } from "@/lib/i18n";
import { createFormat, type Format } from "@/lib/format";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";

// The client half of the i18n seam. app/layout.tsx resolves the request's
// locale on the server (getI18n) and passes it here ONCE with that locale's
// catalog; client components call useT() — their one entry point — and never
// resolve a locale themselves. The default (no provider) is en with no
// catalog — today's strings — so a component test without it is unchanged.

const I18nContext = createContext<{ t: Translate; format: Format; locale: Locale }>({
  t: createTranslator(DEFAULT_LOCALE),
  format: createFormat(DEFAULT_LOCALE),
  locale: DEFAULT_LOCALE,
});

type Props = { locale: Locale; messages: Messages; children: React.ReactNode };

export function I18nProvider({ locale, messages, children }: Props) {
  const value = useMemo(
    () => ({ t: createTranslator(locale, messages), format: createFormat(locale), locale }),
    [locale, messages],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): Translate {
  return useContext(I18nContext).t;
}

/** Date / relative-time / count formatters bound to the active locale (same seam as useT). */
export function useFormat(): Format {
  return useContext(I18nContext).format;
}

/** The active (resolved) locale — for the language picker; text goes through useT(). */
export function useLocale(): Locale {
  return useContext(I18nContext).locale;
}
