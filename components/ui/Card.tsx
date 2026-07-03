import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** Adds hover affordance styling for cards that are themselves clickable. */
  interactive?: boolean;
};

/**
 * Card — a bordered surface container. The default is a static panel; pass
 * `interactive` when the whole card is a link/button target (adds a hover
 * border). Token-driven so it flips in dark mode.
 */
export function Card({ interactive = false, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border-subtle bg-surface p-4",
        interactive && "transition-colors hover:border-border",
        className,
      )}
      {...props}
    />
  );
}
