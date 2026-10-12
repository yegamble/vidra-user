"use client";

import { createContext, useContext, useMemo } from "react";

import { createTranslator, type Messages, type Translate } from "@/lib/i18n";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";

// The client half of the i18n seam. app/layout.tsx resolves the request's
// locale on the server (getI18n) and passes it here ONCE with that locale's
// catalog; client components call useT() — their one entry point — and never
// resolve a locale themselves. The default (no provider) is en with no
// catalog — today's strings — so a component test without it is unchanged.

const I18nContext = createContext<{ t: Translate; locale: Locale }>({
  t: createTranslator(DEFAULT_LOCALE),
  locale: DEFAULT_LOCALE,
});

type Props = { locale: Locale; messages: Messages; children: React.ReactNode };

export function I18nProvider({ locale, messages, children }: Props) {
  const value = useMemo(() => ({ t: createTranslator(locale, messages), locale }), [locale, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): Translate {
  return useContext(I18nContext).t;
}

/** The active (resolved) locale — for the language picker; text goes through useT(). */
export function useLocale(): Locale {
  return useContext(I18nContext).locale;
}
