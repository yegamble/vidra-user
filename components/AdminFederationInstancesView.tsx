"use client";

import { useCallback, useState } from "react";

import { ListBoundary } from "@/components/admin/ListBoundary";
import { PagedListShell } from "@/components/admin/PagedListShell";
import { GlobeIcon, ServerIcon } from "@/components/icons";
import { RoleGate } from "@/components/RoleGate";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { InstanceFollow, InstanceFollowState } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { useAsyncAction } from "@/lib/use-async-action";
import { usePagedList } from "@/lib/use-paged-list";

// AdminFederationInstancesView is PeerTube's instance follows (/server/following
// and /server/followers): this instance's actor follows other instances — their
// public videos arrive here once they accept — and other instances follow it,
// receiving its public videos. Admin only; every action is audited server-side.
export function AdminFederationInstancesView() {
  return (
    <RoleGate minRole="admin" action="manage instance follows">
      <div className="flex flex-col gap-10">
        <section aria-labelledby="instance-following-heading" className="flex flex-col gap-3">
          <h2 id="instance-following-heading" className="text-lg font-semibold tracking-tight text-fg">
            Following
          </h2>
          <ListBoundary label="followed instances">
            <FollowingList />
          </ListBoundary>
        </section>
        <section aria-labelledby="instance-followers-heading" className="flex flex-col gap-3">
          <h2 id="instance-followers-heading" className="text-lg font-semibold tracking-tight text-fg">
            Followers
          </h2>
          <ListBoundary label="instance followers">
            <FollowersList />
          </ListBoundary>
        </section>
      </div>
    </RoleGate>
  );
}

const STATE_BADGE: Record<InstanceFollowState, { label: string; variant: BadgeVariant }> = {
  pending: { label: "Pending", variant: "warning" },
  accepted: { label: "Accepted", variant: "success" },
  rejected: { label: "Rejected", variant: "danger" },
};

function FollowingList() {
  const list = usePagedList<InstanceFollow>({
    load: (query, signal) =>
      api
        .getInstanceFollowing({ limit: query.limit, offset: query.offset }, signal)
        .then((res) => ({ items: res.follows, total: res.total, limit: res.limit, offset: res.offset })),
  });
  const { items, patch, prepend } = list;
  // Following is idempotent: re-following a listed instance returns its row,
  // so that path patches instead of prepending (the total must not climb).
  const onFollowed = useCallback(
    (f: InstanceFollow) => {
      if (items.some((i) => i.id === f.id)) patch((rows) => rows.map((i) => (i.id === f.id ? f : i)));
      else prepend(f);
    },
    [items, patch, prepend],
  );
  return (
    <PagedListShell
      list={list}
      noun="followed instance"
      toolbar={<FollowInstanceForm onFollowed={onFollowed} />}
      errorMessage="Could not load the instances this one follows."
      emptyIcon={<ServerIcon size={24} />}
      emptyTitle="Not following any instances"
      emptyMessage="Follow an instance above. Its public videos start arriving here once it accepts."
    >
      <ul className="flex flex-col gap-2">
        {list.items.map((f) => (
          <li key={f.id}>
            <InstanceRow
              follow={f}
              actions={[
                {
                  label: "Unfollow",
                  confirm: `Stop following ${f.host}? Its new videos stop arriving.`,
                  run: async () => {
                    await api.unfollowInstance(f.id);
                    list.drop((i) => i.id !== f.id);
                  },
                },
              ]}
            />
          </li>
        ))}
      </ul>
    </PagedListShell>
  );
}

function FollowersList() {
  const list = usePagedList<InstanceFollow>({
    load: (query, signal) =>
      api
        .getInstanceFollowers({ limit: query.limit, offset: query.offset }, signal)
        .then((res) => ({ items: res.follows, total: res.total, limit: res.limit, offset: res.offset })),
  });
  const setState = (id: string, state: InstanceFollowState) =>
    list.patch((rows) => rows.map((i) => (i.id === id ? { ...i, state } : i)));
  return (
    <PagedListShell
      list={list}
      noun="instance follower"
      errorMessage="Could not load the instances following this one."
      emptyIcon={<GlobeIcon size={24} />}
      emptyTitle="No instance follows this one yet"
      emptyMessage="When a PeerTube or vidra instance follows this one, it appears here. While follower approval is on, it waits for you."
    >
      <ul className="flex flex-col gap-2">
        {list.items.map((f) => {
          const accept: RowAction = {
            label: "Accept",
            primary: true,
            confirm: `Accept ${f.host}? It receives this instance's public videos.`,
            run: async () => {
              await api.acceptInstanceFollower(f.id);
              setState(f.id, "accepted");
            },
          };
          const reject: RowAction = {
            label: "Reject",
            confirm: `Reject ${f.host}? It stops receiving videos and cannot follow again until removed.`,
            run: async () => {
              await api.rejectInstanceFollower(f.id);
              setState(f.id, "rejected");
            },
          };
          const removeRow: RowAction = {
            label: "Remove",
            confirm: `Remove ${f.host}? It may follow again later.`,
            run: async () => {
              await api.removeInstanceFollower(f.id);
              list.drop((i) => i.id !== f.id);
            },
          };
          const actions =
            f.state === "pending" ? [accept, reject] : f.state === "accepted" ? [reject, removeRow] : [removeRow];
          return (
            <li key={f.id}>
              <InstanceRow follow={f} actions={actions} />
            </li>
          );
        })}
      </ul>
    </PagedListShell>
  );
}

function FollowInstanceForm({ onFollowed }: { onFollowed: (f: InstanceFollow) => void }) {
  const [host, setHost] = useState("");
  const { run, busy, error, clearError } = useAsyncAction(
    async (h: string) => {
      onFollowed(await api.followInstance(h));
      setHost("");
    },
    "Could not follow this instance.",
    (err) =>
      err instanceof ApiError && err.status === 422
        ? "Enter the host of a reachable PeerTube or vidra instance, e.g. videos.example."
        : null,
  );
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const h = host.trim().toLowerCase();
        if (h !== "" && !busy) void run(h);
      }}
    >
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          aria-label="Instance host to follow"
          placeholder="Instance host, e.g. videos.example"
          value={host}
          onChange={(e) => {
            setHost(e.target.value);
            clearError();
          }}
          className="focus-ring w-full max-w-xs rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg placeholder:text-fg-muted"
        />
        <Button type="submit" size="sm" disabled={busy || host.trim() === ""}>
          {busy ? "Following…" : "Follow"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}

type RowAction = { label: string; primary?: boolean; confirm?: string; run: () => Promise<void> };

function InstanceRow({ follow, actions }: { follow: InstanceFollow; actions: RowAction[] }) {
  const [confirming, setConfirming] = useState<RowAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const badge = STATE_BADGE[follow.state];

  async function perform(action: RowAction) {
    setBusy(true);
    setError(null);
    try {
      await action.run();
      setConfirming(null);
    } catch (err) {
      setError(errorMessage(err, `Could not ${action.label.toLowerCase()} ${follow.host}.`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-2xl bg-surface-muted p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-semibold tracking-tight text-fg">{follow.host}</span>
        <Badge variant={badge.variant}>{badge.label}</Badge>
        <span className="text-[13px] text-fg-muted">since {relativeTime(follow.created_at)}</span>
      </div>
      <p className="mt-1 break-all text-xs text-fg-muted">{follow.handle}</p>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {confirming ? (
          <>
            <span className="text-sm text-fg-muted">{confirming.confirm}</span>
            <Button
              size="sm"
              variant={confirming.primary ? "primary" : "danger"}
              aria-label={`Confirm ${confirming.label.toLowerCase()} ${follow.host}`}
              disabled={busy}
              onClick={() => void perform(confirming)}
            >
              {confirming.label}
            </Button>
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => setConfirming(null)}>
              Cancel
            </Button>
          </>
        ) : (
          actions.map((a) => (
            <Button
              key={a.label}
              size="sm"
              variant={a.primary ? "primary" : "secondary"}
              aria-label={`${a.label} ${follow.host}`}
              disabled={busy}
              onClick={() => (a.confirm ? setConfirming(a) : void perform(a))}
            >
              {a.label}
            </Button>
          ))
        )}
      </div>
    </article>
  );
}
