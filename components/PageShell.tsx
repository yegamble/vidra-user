import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/cn";

type PageShellProps = ComponentPropsWithoutRef<"main"> & {
  /** Preserve edge-to-edge phone layouts while joining the desktop page grid. */
  gutters?: "standard" | "desktop";
};

// Shared outer canvas for primary app destinations. Content may still choose a
// narrower inner measure (forms and long-form reading should), but page edges,
// responsive gutters, and the desktop maximum no longer change per route.
export function PageShell({
  children,
  className,
  gutters = "standard",
  ...props
}: PageShellProps) {
  return (
    <main
      data-page-shell=""
      className={cn(
        "mx-auto w-full max-w-[1480px] flex-1",
        gutters === "standard" ? "px-4 sm:px-6 lg:px-8" : "sm:px-6 lg:px-8",
        className,
      )}
      {...props}
    >
      {children}
    </main>
  );
}
