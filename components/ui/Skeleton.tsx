import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export type SkeletonProps = HTMLAttributes<HTMLDivElement>;

/**
 * Skeleton — an animated placeholder block for loading states. Give it a size
 * via className (e.g. `h-4 w-32`, `aspect-video`). Decorative (aria-hidden):
 * the surrounding region should carry the accessible loading status (a Spinner
 * with role="status", or aria-busy). The pulse honors prefers-reduced-motion
 * (globals.css neutralizes the animation).
 */
export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-surface-muted", className)}
      {...props}
    />
  );
}
