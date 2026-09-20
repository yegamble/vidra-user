import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/cn";

/** One themed popup skin; callers retain their placement and keyboard behavior. */
export function MenuSurface({ className, ...props }: ComponentPropsWithRef<"div">) {
  return <div {...props} role="menu" className={cn(
    "menu-surface z-50 overflow-y-auto overscroll-contain rounded-xl border border-border-subtle bg-surface-raised p-1 shadow-soft-strong",
    className,
  )} />;
}
