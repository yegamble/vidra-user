/**
 * The watch surface's page container, owned by the PAGE rather than by the
 * route's <main>.
 *
 * The two watch routes (`/videos/[id]`, `/v/[code]`) and the route loading
 * boundary used to put `mx-auto max-w-[1280px] px-… py-…` on <main> itself.
 * That made a full-bleed element impossible: theater mode has to span the whole
 * width of `#main-content`, and no child of a max-width container can do that
 * honestly (the 100vw + negative-margin trick over-measures by the scrollbar and
 * reintroduces the horizontal overflow e2e/responsive.spec.ts forbids). So
 * <main> is now a bare flex child and WatchView renders the container itself,
 * around everything EXCEPT the theater band.
 *
 * Exported from a plain module (not WatchView, which is "use client") so the
 * server route files and the loading boundary can share the one definition
 * instead of three copies drifting apart.
 */

/** The container, with the page's own vertical rhythm. */
export const WATCH_CONTENT =
  "mx-auto w-full max-w-[1280px] px-4 py-4 sm:px-6 sm:py-6";

/**
 * The inset that puts a row sitting inside the FULL-BLEED theater band back on
 * the page's content column (the resume/shortcuts row, the IPFS source bar, the
 * transcoding note). `max-w + px` reproduces `.watch-layout`'s grid measure
 * exactly at every width, so these rows line up with the title below them.
 *
 * `xl:`-only because theater itself is: below the two-column breakpoint the
 * band is inert and `.watch-layout`'s own padding is already the gutter —
 * applying this there would pad twice.
 */
export const WATCH_THEATER_INSET = "xl:mx-auto xl:w-full xl:max-w-[1280px] xl:px-6";
