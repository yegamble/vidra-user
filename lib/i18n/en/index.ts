import type { Message } from "../index";

import { a11y } from "./a11y";
import { account } from "./account";
import { auth } from "./auth";
import { common } from "./common";
import { create } from "./create";
import { header } from "./header";
import { home } from "./home";
import { nav } from "./nav";
import { notifications } from "./notifications";
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
export const EN_NAMESPACES = { a11y, account, auth, common, create, header, home, nav, notifications, report, search, state, theme };

export const en = {
  ...a11y,
  ...account,
  ...auth,
  ...common,
  ...create,
  ...header,
  ...home,
  ...nav,
  ...notifications,
  ...report,
  ...search,
  ...state,
  ...theme,
} as const satisfies Record<string, Message>;

/** A valid message key — every key present in the default catalog. */
export type MessageKey = keyof typeof en;
