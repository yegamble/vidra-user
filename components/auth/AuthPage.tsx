import Link from "next/link";

import { cn } from "@/lib/cn";

/** A safely centered, scrollable canvas for focused account-entry flows. */
export function AuthPage({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 px-5 py-10 sm:px-6 sm:py-16">
      <div className="my-auto w-full">{children}</div>
    </main>
  );
}

/** The auth flow's single route back to the browsing experience. */
export function AuthBrandLink({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "focus-ring inline-flex min-h-11 items-center justify-center rounded-xl px-2 font-bold leading-none tracking-[-0.05em] text-fg transition-opacity hover:opacity-70",
        className,
      )}
    >
      Vidra
    </Link>
  );
}

export function AuthPageHeading({ title }: { title: string }) {
  return (
    <div className="mb-8 flex flex-col items-center gap-3 text-center">
      <AuthBrandLink className="text-[28px]" />
      <h1 className="text-[26px] font-bold tracking-[-0.04em] text-fg">{title}</h1>
    </div>
  );
}
