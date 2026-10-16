import { cookies, headers } from "next/headers";
import { cache } from "react";

import { createFormat } from "@/lib/format";
import { getInstanceConfig } from "@/lib/instance-config.server";

import { CATALOGS } from "./catalogs";
import { createTranslator } from "./index";
import { LOCALE_COOKIE, localeDir, resolveLocale } from "./locales";

/**
 * The request's locale, catalog and bound `t()` for server components. Reading
 * cookies()/headers() makes the caller dynamic, which the root layout already
 * is (force-dynamic): no rendering mode changes, and a localized document is
 * never prerendered or ISR-cached. cache() dedupes it within one render pass.
 */
export const getI18n = cache(async () => {
  const [cookieStore, requestHeaders, instance] = await Promise.all([cookies(), headers(), getInstanceConfig()]);
  const locale = resolveLocale({
    cookie: cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage: requestHeaders.get("accept-language"),
    // The default CONTENT language: the nearest operator signal until core
    // has a UI-language setting.
    instanceDefault: instance?.default_language,
  });
  const messages = CATALOGS[locale];
  return { locale, dir: localeDir(locale), messages, t: createTranslator(locale, messages), format: createFormat(locale) };
});
