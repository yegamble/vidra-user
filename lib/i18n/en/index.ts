import type { Message } from "../index";

import { a11y } from "./a11y";
import { auth } from "./auth";
import { common } from "./common";
import { home } from "./home";
import { header } from "./header";
import { report } from "./report";
import { search } from "./search";
import { state } from "./state";
import { theme } from "./theme";

/**
 * Default-locale (en) catalog — the source of truth for every message key.
 * Other locales translate a subset; a key they lack renders this text.
 *
 * Naming: `<surface>.<component>.<purpose>` (e.g. `watch.actions.share`), and
 * a key lives in ./<surface>.ts, merged here — one file per surface, so
 * parallel extraction PRs do not collide. Copy shared across surfaces goes
 * under `common.*` only. Keys predating the rule keep their two segments.
 *
 * Values are plain text. `{name}` placeholders become `t()`'s typed vars; a
 * plural is an object of CLDR forms (`one`, `other`, …) picked by `count`.
 */
export const EN_NAMESPACES = { a11y, auth, common, header, home, report, search, state, theme };

export const en = {
  ...a11y,
  ...auth,
  ...common,
  ...home,
  ...header,
  ...report,
  ...search,
  ...state,
  ...theme,
} as const satisfies Record<string, Message>;

/** A valid message key — every key present in the default catalog. */
export type MessageKey = keyof typeof en;
