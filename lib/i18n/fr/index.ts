import type { Messages } from "../index";

import { account } from "./account";
import { a11y } from "./a11y";
import { admin } from "./admin";
import { auth } from "./auth";
import { common } from "./common";
import { home } from "./home";
import { report } from "./report";
import { search } from "./search";
import { settings } from "./settings";
import { create } from "./create";
import { header } from "./header";
import { nav } from "./nav";
import { channel } from "./channel";
import { watch } from "./watch";
import { panels } from "./panels";
import { notifications } from "./notifications";
import { state } from "./state";
import { theme } from "./theme";

/**
 * French — a SEED proving the pipeline (LOCALES marks it partial, so only a
 * viewer who picks French sees it); a key missing here renders the English.
 * Same layout as ../en: one file per surface, merged here.
 *
 * REVIEW STATUS: every string under a "machine-drafted" rule was drafted by an
 * AI model (2026-10-12) and has not been read by a native speaker. A reviewer
 * moves each string they approve ABOVE that rule.
 */
export const FR_NAMESPACES = { account, a11y, admin, auth, channel, common, create, header, home, nav, notifications, panels, report, search, settings, state, theme, watch };

export const fr = { ...account, ...a11y, ...admin, ...auth, ...common, ...home, ...report, ...search, ...settings, ...create, ...header, ...nav, ...channel, ...watch, ...panels, ...notifications, ...state, ...theme } satisfies Messages;
