// AmbientGlow renders the Watch page's signature ambient halo: a blurred, scaled,
// saturated copy of the video poster that bleeds vertically behind the player for
// a soft glow (strongest in dark mode). Purely decorative (aria-hidden) and
// CSS-only (brief decision #13) — never a second <img> fetch, it reuses the
// poster the player already loads as a background image. Clipped to the player's
// own width (inset-x-0 + overflow-hidden) so the blur never bleeds sideways into
// horizontal page overflow (the responsive gate). Renders nothing when the video
// has no poster (e.g. a thumbnail-less upload), so the halo only ever appears
// where there is real imagery to bloom from.
export function AmbientGlow({ posterUrl }: { posterUrl: string | null }) {
  if (!posterUrl) return null;
  return (
    <div
      aria-hidden
      data-testid="ambient-glow"
      className="pointer-events-none absolute inset-x-0 -inset-y-6 -z-10 overflow-hidden"
    >
      <div
        className="h-full w-full scale-105 bg-cover bg-center opacity-45 blur-[52px] saturate-150"
        style={{ backgroundImage: `url("${posterUrl}")` }}
      />
    </div>
  );
}
