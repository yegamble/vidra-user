"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

import { useLocale, useT } from "@/components/I18nProvider";
import { Select } from "@/components/ui/Select";
import { LOCALES, LOCALE_COOKIE } from "@/lib/i18n/locales";

const AUTOMATIC = "auto";
const ONE_YEAR = 60 * 60 * 24 * 365;

function hasLocaleCookie(): boolean {
  return document.cookie.split("; ").some((c) => c.startsWith(`${LOCALE_COOKIE}=`));
}

const subscribeNever = () => () => {};

/**
 * LanguagePicker — the explicit UI-language choice. Writes the locale cookie
 * the server negotiates from (an explicit choice beats Accept-Language), then
 * refreshes so server components re-render in the new language. "Automatic"
 * clears the cookie. A locale whose catalog is incomplete is still choosable
 * but labelled "(partial)": missing strings render in English. Device-level,
 * like the theme; a saved per-account preference needs a core contract.
 */
export function LanguagePicker() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  // The cookie is client-only state; the server snapshot (no cookie) keeps hydration stable.
  const stored = useSyncExternalStore(subscribeNever, hasLocaleCookie, () => false);
  const [chosen, setChosen] = useState<string | null>(null);
  const value = chosen ?? (stored ? locale : AUTOMATIC);

  function choose(next: string) {
    setChosen(next);
    document.cookie =
      next === AUTOMATIC
        ? `${LOCALE_COOKIE}=; path=/; max-age=0; SameSite=Lax`
        : `${LOCALE_COOKIE}=${next}; path=/; max-age=${ONE_YEAR}; SameSite=Lax`;
    router.refresh();
  }

  return (
    <Select label={t("theme.language")} hint={t("theme.language.hint")} value={value} onChange={(e) => choose(e.target.value)}>
      <option value={AUTOMATIC}>{t("theme.language.automatic")}</option>
      {Object.entries(LOCALES).map(([code, { name, complete }]) => (
        <option key={code} value={code}>
          {complete ? name : t("theme.language.partial", { name })}
        </option>
      ))}
    </Select>
  );
}
