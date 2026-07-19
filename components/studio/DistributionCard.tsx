"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ChevronRightIcon } from "@/components/icons";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { Toggle } from "@/components/ui/Toggle";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { Channel } from "@/lib/api";

// The ATProto probe mirrors /settings/connections exactly: GET /me/atproto
// answers 200 (linked), 404 (not linked → connect CTA), or 503 (the extension
// is disabled on this instance → the row is hidden). It gates whether the
// ATProto row is shown/toggleable at all; the channel's own atproto_enabled /
// atproto_active fields drive the actual state.
type AtProto = "loading" | "disabled" | "linked" | "unlinked";
type Field = "activitypub_enabled" | "atproto_enabled";

// DistributionCard — the Studio "Distribution" surface: how this channel's videos
// travel across protocols.
//   • ActivityPub — federation, toggled per-channel via PATCH activitypub_enabled.
//   • ATProto (Bluesky) — cross-posting, toggled via PATCH atproto_enabled; the
//     toggle is only meaningful once the account has a linked Bluesky account, so
//     an unlinked owner sees a "Link your Bluesky account" CTA instead, and a
//     disabled instance hides the row entirely.
// Owner-only toggles (`canManage`); editors and the dashboard summary see
// read-only status badges. On the dashboard it links through to the Channel tab
// (`href`); on the Channel tab it stands alone with live toggles.
export function DistributionCard({
  channel,
  canManage = false,
  href,
  onChange,
}: {
  channel: Channel;
  canManage?: boolean;
  href?: string;
  onChange?: (channel: Channel) => void;
}) {
  const [atproto, setAtproto] = useState<AtProto>("loading");
  const [busy, setBusy] = useState<Field | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getATProtoAccount(controller.signal)
      .then(() => setAtproto("linked"))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 404) {
          setAtproto("unlinked");
        } else if (err instanceof ApiError && err.status === 503) {
          setAtproto("disabled");
        } else {
          // A transient failure: fail toward the connect CTA rather than
          // implying an active cross-post that may not exist.
          setAtproto("unlinked");
        }
      });
    return () => controller.abort();
  }, []);

  async function toggle(field: Field, next: boolean) {
    if (busy) return;
    setBusy(field);
    setError(null);
    try {
      const updated = await api.updateChannel(channel.handle, { [field]: next });
      onChange?.(updated);
    } catch (err) {
      setError(errorMessage(err, "Could not update distribution settings."));
    } finally {
      setBusy(null);
    }
  }

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
        {/* ActivityPub — federation for this channel. */}
        <li className="flex items-center justify-between gap-3 px-3.5 py-3">
          <div className="flex min-w-0 flex-col gap-1">
            <Badge variant="protocol" protocol="activitypub">
              ActivityPub
            </Badge>
            <span className="text-[12.5px] text-fg-muted">
              {channel.activitypub_enabled
                ? "Your public videos federate to other ActivityPub servers."
                : "Federation is off — this channel's videos stay on this instance."}
            </span>
          </div>
          {canManage ? (
            <Toggle
              label="Federate this channel over ActivityPub"
              checked={channel.activitypub_enabled}
              disabled={busy !== null}
              onChange={(next) => void toggle("activitypub_enabled", next)}
            />
          ) : (
            <Badge variant={channel.activitypub_enabled ? "success" : "neutral"} status>
              {channel.activitypub_enabled ? "Active" : "Off"}
            </Badge>
          )}
        </li>

        {/* ATProto (Bluesky) — hidden entirely when the instance disables it. */}
        {atproto === "disabled" ? null : (
          <li className="flex items-center justify-between gap-3 px-3.5 py-3">
            <div className="flex min-w-0 flex-col gap-1">
              <Badge variant="protocol" protocol="bluesky">
                ATProto
              </Badge>
              <span className="truncate text-[12.5px] text-fg-muted">
                Cross-post new public videos to the Bluesky network.
              </span>
            </div>
            {atproto === "loading" ? (
              <Skeleton className="h-6 w-16 rounded-full" />
            ) : canManage && atproto === "unlinked" ? (
              <Link
                href="/settings/connections"
                className="focus-ring shrink-0 rounded-full text-[13px] font-semibold text-accent-text hover:underline"
              >
                Link your Bluesky account
              </Link>
            ) : canManage ? (
              <Toggle
                label="Cross-post this channel to Bluesky"
                checked={channel.atproto_enabled}
                disabled={busy !== null}
                onChange={(next) => void toggle("atproto_enabled", next)}
              />
            ) : (
              <Badge variant={channel.atproto_active ? "success" : "neutral"} status>
                {channel.atproto_active ? "Active" : "Off"}
              </Badge>
            )}
          </li>
        )}
      </ul>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </section>
  );
}
