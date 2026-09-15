/**
 * The press recipe shared by every pressable control in the player's media
 * overlay — the round icon buttons and the speed/quality pills. It lives in one
 * place because it was wrong in two: each copy said
 * `motion-reduce:transform-none`, which CANNOT cancel `hover:scale-105`. In
 * Tailwind v4 the scale utilities compile to the `scale` PROPERTY, not to a
 * `transform`, so `transform: none` leaves the pop running for exactly the
 * viewers who asked for it not to. The fix is to neutralise the same property
 * the hover sets, under the same variants.
 */
export const MEDIA_PRESS =
  "transition-[color,background-color,scale] duration-150 ease-out hover:scale-105 active:scale-95 motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100";
