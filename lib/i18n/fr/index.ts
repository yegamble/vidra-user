import type { Messages } from "../index";

import { a11y } from "./a11y";
import { account } from "./account";
import { admin } from "./admin";
import { auth } from "./auth";
import { channel } from "./channel";
import { comments } from "./comments";
import { common } from "./common";
import { create } from "./create";
import { header } from "./header";
import { home } from "./home";
import { live } from "./live";
import { nav } from "./nav";
import { notifications } from "./notifications";
import { panels } from "./panels";
import { playlists } from "./playlists";
import { report } from "./report";
import { search } from "./search";
import { settings } from "./settings";
import { state } from "./state";
import { studio } from "./studio";
import { theme } from "./theme";
import { watch } from "./watch";

/**
 * French has parity with the current English catalog. Explicit selection is
 * available; automatic selection still awaits native-speaker review.
 * Same layout as ../en: one file per surface, merged here.
 *
 * REVIEW STATUS: strings under a "machine-drafted" rule were drafted by an
 * AI model and have not been read by a native speaker. A reviewer moves each
 * approved string ABOVE that rule. Catalog parity does not imply that every
 * hardcoded string in the UI has been extracted.
 */
export const FR_NAMESPACES = {
  a11y,
  account,
  admin,
  auth,
  channel,
  comments,
  common,
  create,
  header,
  home,
  live,
  nav,
  notifications,
  panels,
  playlists,
  report,
  search,
  settings,
  state,
  studio,
  theme,
  watch,
};

export const fr = {
  ...a11y,
  ...account,
  ...admin,
  ...auth,
  ...channel,
  ...comments,
  ...common,
  ...create,
  ...header,
  ...home,
  ...live,
  ...nav,
  ...notifications,
  ...panels,
  ...playlists,
  ...report,
  ...search,
  ...settings,
  ...state,
  ...studio,
  ...theme,
  ...watch,
} satisfies Messages;
