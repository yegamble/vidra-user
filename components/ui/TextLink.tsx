import Link from "next/link";
import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

export type TextLinkProps = ComponentProps<typeof Link>;

/**
 * TextLink — an inline link inside a sentence: underlined, offset so the rule
 * clears the descenders, and dimming on hover.
 *
 * The same idea was written four different ways across the app (`rounded` vs
 * `rounded-sm`, with and without `underline-offset-2`, with and without the
 * hover transition, and one bare `underline hover:text-fg` in the studio
 * layout). None of the differences were decisions.
 *
 * `cn` is a plain join, not tailwind-merge, so extend with additive classes
 * only — a `className` that fights a base utility will not reliably win.
 */
export function TextLink({ className, ...props }: TextLinkProps) {
  return (
    <Link
      className={cn(
        "focus-ring rounded font-semibold text-fg underline underline-offset-2 transition-colors hover:text-fg-muted",
        className,
      )}
      {...props}
    />
  );
}
