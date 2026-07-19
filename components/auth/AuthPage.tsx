import Link from "next/link";

import { ProtocolRibbon } from "@/components/ProtocolRibbon";
import { cn } from "@/lib/cn";

// The account-entry flows (login / signup / password reset / email verify) are
// standalone routes: the app header, sidebar, and phone tab bar step aside
// (lib/app-shell.isStandaloneRoute), so these components own the whole page.
// Apple-ID styling: one focused task on a narrow, centered column over the soft
// canvas, led by the Vidra wordmark + tri-protocol ribbon lockup.

/** A safely centered, scrollable canvas for focused account-entry flows. */
export function AuthPage({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col px-5 py-12 sm:px-6 sm:py-20">
      <div className="my-auto w-full">{children}</div>
    </main>
  );
}

/**
 * The auth flow's single route back to the browsing experience — the "Vidra"
 * wordmark rendered as a home link. Its accessible name is PINNED to "Vidra"
 * (apple-ux.spec asserts a `main > link` named exactly "Vidra" → "/" with a
 * ≥44px target on every standalone auth route); keep the text and href stable.
 */
export function AuthBrandLink({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "focus-ring inline-flex min-h-11 items-center justify-center rounded-xl px-3 font-bold leading-none tracking-[-0.045em] text-fg transition-opacity hover:opacity-70",
        className,
      )}
    >
      Vidra
    </Link>
  );
}

/**
 * The Apple-ID brand lockup: the "Vidra" wordmark with the tri-protocol ribbon
 * directly beneath it. This IS placement (a) of the three sanctioned ribbon
 * uses ("under the wordmark") — on standalone auth routes the global Header
 * steps aside, so its wordmark-ribbon is rendered here instead; the two never
 * co-occur. The ribbon is decorative (aria-hidden) so the link name stays
 * "Vidra". Rendered as a `<span>` so a caller can wrap it in an `<h1>`.
 */
export function AuthWordmark({ brandClassName = "text-[26px]" }: { brandClassName?: string }) {
  return (
    <span className="flex flex-col items-center gap-2">
      <AuthBrandLink className={brandClassName} />
      {/* Constrain the full-width ribbon to a short accent rule under the mark. */}
      <span className="block w-12">
        <ProtocolRibbon />
      </span>
    </span>
  );
}

/**
 * The heading block for the secondary auth screens (signup / reset / verify):
 * the brand lockup above a Title (28px) greeting. The `title` string is the
 * page's `<h1>` and is PINNED by apple-ux.spec (e.g. "Create your account",
 * "Reset your password") — keep it exact when restyling.
 */
export function AuthPageHeading({ title }: { title: string }) {
  return (
    <div className="mb-8 flex flex-col items-center gap-4 text-center">
      <AuthWordmark brandClassName="text-2xl" />
      <h1 className="text-title text-fg">{title}</h1>
    </div>
  );
}
