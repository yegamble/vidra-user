import { fr } from "./fr";
import type { Messages } from "./index";
import type { Locale } from "./locales";

// Every shipped catalog; the Record makes a locale without one a compile
// error. Server-side only (./locale.server): the client gets just the active
// catalog as an I18nProvider prop. en is the built-in fallback, hence empty.
export const CATALOGS: Record<Locale, Messages> = { en: {}, fr };
