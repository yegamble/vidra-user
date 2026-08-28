// The horizontal snap rail, as one recipe.
//
// Four surfaces build the same rail — the home shelves, its loading skeleton,
// the "Live now" strip and the recommendations strip — and all four had the tile
// width written out character for character while the TRACK had drifted into two
// different ways of hiding the scrollbar: the `.scrollbar-none` utility in
// app/globals.css, and a hand-rolled trio of arbitrary properties. They now share
// these constants, on the utility.
//
// Markup stays per-rail: they hold cards, skeletons and links, and only their
// geometry was ever the same thing.

/**
 * The scrollable snap track: hidden scrollbar (the row still scrolls by touch
 * and trackpad, and focus order reaches every card), 16px gutters, and a little
 * bottom padding so hover lift is not clipped.
 */
export const RAIL_TRACK =
  "scrollbar-none flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2";

/**
 * The same track for a static twin — a loading skeleton, which must not scroll
 * or snap: there is nothing to scroll to yet, and a draggable placeholder reads
 * as a broken rail.
 */
export const RAIL_TRACK_STATIC = "scrollbar-none flex gap-4 overflow-x-hidden pb-2";

/**
 * One tile. Viewport-capped so a phone shows one card and a hint of the next,
 * and `flex-none` so the rail never widens the page — that is what keeps the
 * 390px canvas free of horizontal overflow.
 */
export const RAIL_TILE = "w-[min(82vw,20rem)] flex-none snap-start sm:w-72 lg:w-64 xl:w-72";
