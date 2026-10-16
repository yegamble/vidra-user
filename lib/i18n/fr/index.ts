import type { Messages } from "../index";

import { admin } from "./admin";
import { a11y } from "./a11y";
import { common } from "./common";
import { home } from "./home";
import { report } from "./report";
import { search } from "./search";
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
export const FR_NAMESPACES = { admin, a11y, common, home, report, search, state, theme };

export const fr = { ...admin, ...a11y, ...common, ...home, ...report, ...search, ...state, ...theme } satisfies Messages;
