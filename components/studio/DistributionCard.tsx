"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ProtocolBadge } from "@/components/ProtocolBadge";
import { ChevronRightIcon } from "@/components/icons";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { ApiError, api } from "@/lib/api";
import type { ATProtoStatus } from "@/lib/api";

// The ATProto probe mirrors /settings/connections exactly: GET /me/atproto
// answers 200 (linked), 404 (not linked → connect CTA), or 503 (the extension
// is disabled on this instance → the row is hidden). Kept behind one small
// state machine so the Phase-C swap to per-channel flags is a local edit.
type AtProto = "loading" | "disabled" | "linked" | "unlinked";

// DistributionCard — the Studio "Distribution" surface (Phase B, read-only). It
// shows how this creator's videos travel:
//   • ActivityPub — federation, shown as an always-active badge (account-level;
//     per-channel enable/disable toggles are Phase C).
//   • ATProto (Bluesky) — driven by the account-level GET /me/atproto probe, the
//     same way /settings/connections does: a connected account shows its handle,
//     an unlinked one shows a connect CTA, and a disabled instance hides the row.
// No toggles yet (Phase C wires per-channel PATCH flags). On the dashboard it
// links through to the Channel tab; on the Channel tab it stands alone.
export function DistributionCard({ href }: { href?: string }) {
  const [atproto, setAtproto] = useState<AtProto>("loading");
  const [account, setAccount] = useState<ATProtoStatus | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getATProtoAccount(controller.signal)
      .then((res) => {
        setAccount(res);
        setAtproto("linked");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 404) {
          setAccount(null);
          setAtproto("unlinked");
        } else if (err instanceof ApiError && err.status === 503) {
          setAtproto("disabled");
        } else {
          // A transient failure: treat as unlinked (fail toward the connect CTA
          // rather than claiming a connection that may not exist).
          setAtproto("unlinked");
        }
      });
    return () => controller.abort();
  }, []);

  return (
    <section
      aria-labelledby="distribution-heading"
      className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-soft"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="distribution-heading" className="text-[15px] font-bold tracking-tight">
          Distribution
        </h2>
        {href ? (
          <Link
            href={href}
            className="focus-ring inline-flex items-center gap-0.5 rounded-full text-[13px] font-semibold text-accent-text hover:underline"
          >
            Manage
            <ChevronRightIcon size={15} aria-hidden="true" />
          </Link>
        ) : null}
      </div>

      <ul className="flex flex-col divide-y divide-border-subtle overflow-hidden rounded-xl bg-surface-muted">
        {/* ActivityPub — always active (federation is on at the account level). */}
        <li className="flex items-center justify-between gap-3 px-3.5 py-3">
          <div className="flex min-w-0 flex-col gap-1">
            <ProtocolBadge protocol="activitypub" />
            <span className="text-[12.5px] text-fg-muted">
              Your public videos federate to other ActivityPub servers.
            </span>
          </div>
          <Badge variant="success" status>
            Active
          </Badge>
        </li>

        {/* ATProto (Bluesky) — hidden entirely when the instance disables it. */}
        {atproto === "disabled" ? null : (
          <li className="flex items-center justify-between gap-3 px-3.5 py-3">
            <div className="flex min-w-0 flex-col gap-1">
              <ProtocolBadge protocol="atproto" />
              <span className="truncate text-[12.5px] text-fg-muted">
                {atproto === "linked" && account
                  ? `Cross-posting to @${account.handle}${account.auto_post ? "" : " (auto-post off)"}`
                  : "Cross-post new public videos to the Bluesky network."}
              </span>
            </div>
            {atproto === "loading" ? (
              <Skeleton className="h-5 w-16 rounded-full" />
            ) : atproto === "linked" && account ? (
              <Badge variant={account.auto_post ? "success" : "neutral"} status>
                {account.auto_post ? "On" : "Linked"}
              </Badge>
            ) : (
              <Link
                href="/settings/connections"
                className="focus-ring shrink-0 rounded-full text-[13px] font-semibold text-accent-text hover:underline"
              >
                Connect
              </Link>
            )}
          </li>
        )}
      </ul>
    </section>
  );
}
