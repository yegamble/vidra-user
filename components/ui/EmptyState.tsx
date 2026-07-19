import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/** Tinted-circle colors an EmptyState may lead with (accent by default). */
export type EmptyStateTint =
  | "accent"
  | "blue"
  | "gray"
  | "red"
  | "purple"
  | "orange"
  | "teal"
  | "green"
  | "pink"
  | "indigo";

// Circle fill (12% tint) + glyph color per tint. Static strings for Tailwind.
const TINT: Record<EmptyStateTint, string> = {
  accent: "bg-accent/12 text-accent",
  blue: "bg-tile-blue/12 text-tile-blue",
  gray: "bg-tile-gray/12 text-tile-gray",
  red: "bg-tile-red/12 text-tile-red",
  purple: "bg-tile-purple/12 text-tile-purple",
  orange: "bg-tile-orange/12 text-tile-orange",
  teal: "bg-tile-teal/12 text-tile-teal",
  green: "bg-tile-green/12 text-tile-green",
  pink: "bg-tile-pink/12 text-tile-pink",
  indigo: "bg-tile-indigo/12 text-tile-indigo",
};

/**
 * EmptyState — a centered "nothing here yet" panel. Redesign: leads with an
 * icon in a 48px tinted circle (accent by default; pass `tint` for a themed
 * hue) instead of a dashed border. `icon` is optional — omit it for a plain
 * text empty state. Pass an icon from `components/icons` (decorative;
 * aria-hidden by default).
 */
export function EmptyState({
  title,
  message,
  icon,
  tint = "accent",
}: {
  title: string;
  message?: ReactNode;
  icon?: ReactNode;
  tint?: EmptyStateTint;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl px-6 py-16 text-center">
      {icon ? (
        <span
          aria-hidden="true"
          className={cn(
            "mb-1 inline-flex h-12 w-12 items-center justify-center rounded-full",
            TINT[tint],
          )}
        >
          {icon}
        </span>
      ) : null}
      <p className="text-lg font-semibold tracking-tight text-fg">{title}</p>
      {message ? <p className="max-w-sm text-sm text-fg-muted">{message}</p> : null}
    </div>
  );
}
