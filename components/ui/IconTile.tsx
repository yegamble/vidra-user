import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/** The fixed Apple system-color tile palette (globals.css `--tile-*`). */
export type TileColor =
  | "blue"
  | "gray"
  | "red"
  | "purple"
  | "orange"
  | "teal"
  | "green"
  | "pink"
  | "indigo";

// Static bg class per color so Tailwind sees every one.
const TILE_BG: Record<TileColor, string> = {
  blue: "bg-tile-blue",
  gray: "bg-tile-gray",
  red: "bg-tile-red",
  purple: "bg-tile-purple",
  orange: "bg-tile-orange",
  teal: "bg-tile-teal",
  green: "bg-tile-green",
  pink: "bg-tile-pink",
  indigo: "bg-tile-indigo",
};

/**
 * IconTile — the System Settings colored square: a 28×28 `rounded-lg` tile in
 * one Apple system color holding a white glyph (~16px). Used to lead
 * grouped Settings / Admin / Moderation rows (one hue per destination).
 *
 * The tile is *supporting* decoration — the adjacent row label carries the
 * meaning — so the white glyph is decorative (render your icon aria-hidden,
 * the default). Give the tile itself an accessible `label` only if it is the
 * row's sole label (rare); otherwise leave it decorative.
 *
 * Pass an icon from `components/icons` as the child; it is forced white and
 * sized ~16px by the tile. Example:
 *   <IconTile color="blue"><UserIcon size={16} /></IconTile>
 */
export function IconTile({
  color,
  children,
  label,
  className,
}: {
  color: TileColor;
  children: ReactNode;
  /** Accessible name if the tile stands alone (usually omit — the row labels). */
  label?: string;
  className?: string;
}) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white [&>svg]:h-4 [&>svg]:w-4",
        TILE_BG[color],
        className,
      )}
    >
      {children}
    </span>
  );
}
