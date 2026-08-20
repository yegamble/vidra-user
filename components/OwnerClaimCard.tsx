"use client";

import { useEffect, useState } from "react";

import { ShieldIcon } from "@/components/icons";
import { LinkButton } from "@/components/ui/LinkButton";
import { getInstanceCached } from "@/lib/api/instance-platform";
import { cn } from "@/lib/cn";
import { isOwnerClaimPending, OWNER_CLAIM_PATH, type OwnerClaimSignal } from "@/lib/owner-claim";

// OwnerClaimCard — the first-run signpost. While a server is waiting for its
// owner, nobody can sign up and nobody can moderate: the single most useful
// thing any page can do is point at the wizard that fixes it. It rides the
// three surfaces a first visitor actually lands on — home, sign in, sign up.
//
// It paints from the server-rendered instance snapshot and then revalidates in
// place from the browser (the same shape as the LoginForm/SignupForm policy
// reads). That second read matters more here than anywhere else: the snapshot
// is null whenever the backend was unreachable at render time, which on a
// brand-new deployment is exactly when the server is still coming up — the one
// moment this card must not stay silent.
//
// Deliberately NOT dismissable: this is not an announcement, it is the one
// outstanding task standing between the server and being usable. It disappears
// on its own the moment the claim succeeds.
export function OwnerClaimCard({
  instance,
  className,
}: {
  /** SSR snapshot; null when the instance document could not be read. */
  instance: OwnerClaimSignal;
  className?: string;
}) {
  const [pending, setPending] = useState(() => isOwnerClaimPending(instance));

  useEffect(() => {
    let cancelled = false;
    getInstanceCached()
      .then((live) => {
        if (!cancelled) setPending(isOwnerClaimPending(live));
      })
      .catch(() => {
        // No instance document — keep whatever the server snapshot said. A card
        // is never invented out of a failed read (the initial state is false).
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!pending) return null;
  return (
    <section
      aria-labelledby="owner-claim-card-heading"
      className={cn(
        "rounded-2xl border border-border-subtle bg-surface p-5 shadow-soft sm:p-6",
        className,
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <span
          aria-hidden="true"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/12 text-accent"
        >
          <ShieldIcon size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="owner-claim-card-heading" className="text-base font-semibold text-fg">
            This server is waiting for its owner
          </h2>
          <p className="mt-1 text-subhead text-fg-muted">
            Nobody has set it up yet, so new accounts are on hold. If this server is yours,
            create the owner account to open it up.
          </p>
        </div>
        <LinkButton href={OWNER_CLAIM_PATH} className="shrink-0 sm:self-center">
          Finish setup
        </LinkButton>
      </div>
    </section>
  );
}
