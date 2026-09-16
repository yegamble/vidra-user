"use client";

import Link from "next/link";

import { ProtocolRibbon } from "@/components/ProtocolRibbon";
import { useSoftwareBrandHidden, useSoftwareName } from "@/components/SoftwareBrandProvider";
import { cn } from "@/lib/cn";
import { NEUTRAL_BRAND_FALLBACK, brandName } from "@/lib/software-brand";

// The account-entry flows (login / signup / password reset / email verify) are
// standalone routes: the app header, sidebar, and phone tab bar step aside
// (lib/app-shell.isStandaloneRoute), so these components own the whole page.
// Apple-ID styling: one focused task on a narrow, centered column over the soft
// canvas, led by the instance wordmark + tri-protocol ribbon lockup.
//
// "use client" so the whole family can read the white-label decision from the
// SoftwareBrandProvider context (wired once in app/layout.tsx) instead of having
// every one of the seven standalone auth routes thread a `hidden` prop through
// AuthPage, AuthPageHeading, AuthWordmark and AuthBrandLink. The name-resolution
// rule itself stays pure and server-safe in lib/software-brand.ts (brandName),
// which is what the server pages import when they need it for a heading string.

/** A safely centered, scrollable canvas for focused account-entry flows. */
export function AuthPage({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col px-5 py-12 sm:px-6 sm:py-20">
      <div className="my-auto w-full">{children}</div>
      <AuthPoweredBy />
    </main>
  );
}

/**
 * The software attribution, kept small and out of the way beneath the task.
 *
 * These screens now wear the INSTANCE's name (a person signing in to
 * "A17 Lab Tube" is not signing in to Vidra, the same way the app header has
 * always shown the operator's name), so the product mark moves here rather than
 * disappearing. Deliberately NOT a link: `apple-ux.spec` pins exactly one
 * `main` link on every standalone auth route — the wordmark home link — and a
 * second one would both break that count and offer a second, lower-value exit
 * from a focused task.
 *
 * White-label: this line is the "Powered by" attribution itself, so a hidden
 * software name removes it ENTIRELY rather than neutralizing its wording —
 * "Powered by this platform" would be worse than silence.
 */
export function AuthPoweredBy() {
  const name = useSoftwareName();
  if (name === null) return null;
  return <p className="mt-10 text-center text-footnote text-fg-muted">Powered by {name}</p>;
}

/**
 * The auth flow's single route back to the browsing experience — the instance
 * wordmark rendered as a home link. `apple-ux.spec` asserts a `main > link`
 * → "/" with a ≥44px target on every standalone auth route; its accessible name
 * is the instance's name (the product name when the instance has none, which is
 * what a build-time prerender and the mocked e2e suite both see, and the
 * neutral "Home" when the software name is hidden and the instance is unnamed —
 * the link must never lose its accessible name).
 */
export function AuthBrandLink({
  className,
  instanceName,
}: {
  className?: string;
  instanceName?: string | null;
}) {
  const hidden = useSoftwareBrandHidden();
  return (
    <Link
      href="/"
      className={cn(
        "focus-ring inline-flex min-h-11 items-center justify-center rounded-xl px-3 font-bold leading-none tracking-[-0.045em] text-fg transition-opacity hover:opacity-70",
        className,
      )}
    >
      {brandName(instanceName, hidden) ?? NEUTRAL_BRAND_FALLBACK}
    </Link>
  );
}

/**
 * The Apple-ID brand lockup: the instance wordmark with the tri-protocol ribbon
 * directly beneath it. This IS placement (a) of the three sanctioned ribbon
 * uses ("under the wordmark") — on standalone auth routes the global Header
 * steps aside, so its wordmark-ribbon is rendered here instead; the two never
 * co-occur. The ribbon is decorative (aria-hidden) so the link name stays the
 * brand. Rendered as a `<span>` so a caller can wrap it in an `<h1>`.
 */
export function AuthWordmark({
  brandClassName = "text-[26px]",
  instanceName,
}: {
  brandClassName?: string;
  instanceName?: string | null;
}) {
  const hidden = useSoftwareBrandHidden();
  return (
    <span className="flex flex-col items-center gap-2">
      <AuthBrandLink className={brandClassName} instanceName={instanceName} />
      {/* Constrain the full-width ribbon to a short accent rule under the mark. */}
      {hidden ? null : (
        <span className="block w-12"><ProtocolRibbon /></span>
      )}
    </span>
  );
}

/**
 * The heading block for the secondary auth screens (signup / reset / verify):
 * the brand lockup above a Title (28px) greeting. The `title` string is the
 * page's `<h1>` and is PINNED by apple-ux.spec (e.g. "Reset your password") —
 * keep it exact when restyling. Screens whose copy names the destination pass
 * the instance name in instead (signup: "Create your <name> account").
 */
export function AuthPageHeading({
  title,
  instanceName,
}: {
  title: string;
  instanceName?: string | null;
}) {
  return (
    <div className="mb-8 flex flex-col items-center gap-4 text-center">
      <AuthWordmark brandClassName="text-2xl" instanceName={instanceName} />
      <h1 className="text-title text-fg">{title}</h1>
    </div>
  );
}
