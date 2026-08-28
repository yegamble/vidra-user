import type { ElementType } from "react";

import { cn } from "@/lib/cn";

/**
 * RestrictedModePlaceholder is what a video tile renders in place of itself when
 * Restricted Mode is on and the video is flagged sensitive
 * (useVideoCardPresentation().restrictedHidden). Every surface showed the same
 * sentence in its own hand-rolled box; the sentence and the centering now live
 * here, while each caller keeps its own geometry (radius, height, padding, type
 * scale) through `className` — a rail tile, a list row and a search row are not
 * the same shape.
 *
 * `variant` picks the surrounding treatment: "tile" is the muted rounded plate
 * used where a thumbnail would sit, "row" is the bare line used inside a bordered
 * list where a plate would fight the row rules.
 */
export function RestrictedModePlaceholder({
  as: Tag = "div",
  variant = "tile",
  className,
}: {
  /** Element to render — search results need an <li> inside their <ul>. */
  as?: ElementType;
  variant?: "tile" | "row";
  className?: string;
}) {
  return (
    <Tag
      className={cn(
        "flex items-center justify-center font-medium text-fg-muted",
        variant === "tile" && "bg-surface-muted text-center",
        className,
      )}
    >
      Hidden by Restricted Mode
    </Tag>
  );
}
