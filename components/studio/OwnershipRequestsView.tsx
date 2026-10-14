"use client";

import Link from "next/link";
import { useState } from "react";

import { useT, useFormat } from "@/components/I18nProvider";
import { useSession } from "@/components/auth/AuthProvider";
import { ShareIcon } from "@/components/icons";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ListTail } from "@/components/ui/ListTail";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { Channel, VideoOwnershipChange } from "@/lib/api";
import { useAppendingList } from "@/lib/use-appending-list";
import { useBrowseAutoLoad } from "@/lib/use-browse-auto-load";

import type { PlainMessageKey, Translate } from "@/lib/i18n";

import { useStudio } from "./StudioContext";

// OwnershipRoute is the /studio/ownership glue. Only the caller's OWN channels
// can receive a video: a channel they edit for someone else belongs to that
// someone, and the server refuses it.
export function OwnershipRoute() {
  const { channels, status } = useStudio();
  const { user } = useSession();
  const own = user ? channels.filter((c) => c.owner_id === user.id) : [];
  return <OwnershipRequestsView channels={own} channelsStatus={status} />;
}

type ChannelsStatus = "loading" | "error" | "ready";

// OwnershipRequestsView lists the videos other users on this instance offered
// the caller (core 0165, PeerTube's "ownership changes"), newest first. A
// pending one is accepted into a chosen channel or refused; answered ones stay
// as history.
export function OwnershipRequestsView({
  channels,
  channelsStatus = "ready",
}: {
  /** The caller's OWN channels — the only valid targets of an accept. */
  channels: Channel[];
  /** Load state of `channels`: requests can arrive before the channel list. */
  channelsStatus?: ChannelsStatus;
}) {
  const t = useT();
  const autoLoad = useBrowseAutoLoad();
  const list = useAppendingList<VideoOwnershipChange>({
    queryKey: "video-ownership-changes",
    getId: (c) => c.id,
    load: (window, signal) =>
      api
        .getVideoOwnershipChanges(window, signal)
        .then((res) => ({ items: res.changes, total: res.total })),
  });
  const { status, items } = list;

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-[15px] font-bold tracking-tight">{t("studio.own.heading")}</h2>
        <p className="mt-1 text-sm text-fg-muted">{t("studio.own.intro")}</p>
      </div>
      {status === "loading" ? (
        <div className="flex justify-center py-8">
          <Spinner label={t("studio.own.loading")} />
        </div>
      ) : status === "error" ? (
        <ErrorState message={t("studio.own.loadError")} onRetry={list.reload} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ShareIcon size={24} />}
          title={t("studio.own.emptyTitle")}
          message={t("studio.own.emptyMessage")}
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle overflow-hidden rounded-2xl border border-border-subtle bg-surface">
          {items.map((c) => (
            <OwnershipRequestRow
              key={c.id}
              change={c}
              channels={channels}
              channelsStatus={channelsStatus}
              onAnswered={(next) =>
                list.patch((rows) => rows.map((x) => (x.id === c.id ? { ...x, status: next } : x)))
              }
            />
          ))}
        </ul>
      )}
      {status === "ready" ? (
        <ListTail
          hasMore={list.hasMore}
          autoLoad={autoLoad}
          busy={list.moreStatus === "loading"}
          error={list.moreStatus === "error" ? t("studio.own.moreError") : null}
          onLoadMore={list.loadMore}
        />
      ) : null}
    </section>
  );
}

// The two quota refusals get copy that says what to do; everything else (an
// answered or stale request, a channel that is not the caller's) carries a
// server message specific enough to show.
function answerError(err: unknown, accepting: boolean, t: Translate): string {
  if (err instanceof ApiError && err.code === "quota_exceeded") {
    return t("studio.own.quota");
  }
  if (err instanceof ApiError && err.code === "daily_quota_exceeded") {
    return t("studio.own.dailyQuota");
  }
  return errorMessage(err, accepting ? t("studio.own.acceptError") : t("studio.own.refuseError"));
}

// What each answered status reads as; pending rows show actions instead.
// Core reports a withdrawn, timed-out or no-longer-honourable offer alike as
// "expired" — the recipient is deliberately not told which — so it reads as
// "No longer available", not as a claim about time.
const STATUS_BADGE: Partial<
  Record<VideoOwnershipChange["status"], { label: PlainMessageKey; variant?: "success" }>
> = {
  accepted: { label: "studio.own.accepted", variant: "success" },
  refused: { label: "studio.own.refused" },
  expired: { label: "studio.own.expired" },
};

function OwnershipRequestRow({
  change,
  channels,
  channelsStatus,
  onAnswered,
}: {
  change: VideoOwnershipChange;
  channels: Channel[];
  channelsStatus: ChannelsStatus;
  onAnswered: (status: "accepted" | "refused") => void;
}) {
  const t = useT();
  const { relativeTime } = useFormat();
  // The picked channel, else the first one — derived on every render, so a
  // channel list that arrives after this row mounted is still honoured.
  const [picked, setChannelId] = useState("");
  const channelId = channels.some((c) => c.id === picked) ? picked : (channels[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const badge = STATUS_BADGE[change.status];
  const giver = change.initiator.display_name || change.initiator.username;

  async function answer(accepting: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (accepting) await api.acceptVideoOwnershipChange(change.id, channelId);
      else await api.refuseVideoOwnershipChange(change.id);
      onAnswered(accepting ? "accepted" : "refused");
    } catch (err) {
      setError(answerError(err, accepting, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-3 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{change.video.title || t("studio.own.untitled")}</p>
          <p className="mt-1 text-xs text-fg-muted">
            {t("studio.own.offeredBy", {
              giver,
              username: change.initiator.username,
              time: relativeTime(change.created_at),
            })}
          </p>
        </div>
        {badge ? <Badge variant={badge.variant}>{t(badge.label)}</Badge> : null}
      </div>
      {change.status === "pending" ? (
        <div className="flex flex-wrap items-end gap-2">
          {channels.length > 0 ? (
            <>
              <div className="min-w-48 flex-1 sm:flex-none">
                <Select
                  label={t("studio.own.acceptInto")}
                  value={channelId}
                  onChange={(e) => setChannelId(e.target.value)}
                  disabled={busy}
                >
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.display_name || c.handle} (@{c.handle})
                    </option>
                  ))}
                </Select>
              </div>
              <Button size="sm" disabled={busy || channelId === ""} onClick={() => void answer(true)}>
                {t("studio.own.accept")}
              </Button>
            </>
          ) : channelsStatus === "loading" ? (
            <p className="text-sm text-fg-muted">{t("studio.own.loadingChannels")}</p>
          ) : channelsStatus === "error" ? (
            <p className="text-sm text-fg-muted">{t("studio.own.channelsError")}</p>
          ) : (
            <p className="text-sm text-fg-muted">
              <Link href="/studio/channel?create=1" className="focus-ring font-semibold text-accent-text hover:underline">
                {t("studio.own.createChannel")}
              </Link>{" "}
              {t("studio.own.toAccept")}
            </p>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void answer(false)}>
            {t("studio.own.refuse")}
          </Button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </li>
  );
}
