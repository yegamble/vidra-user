"use client";

import { useCallback, useState } from "react";

import { useT } from "@/components/I18nProvider";
import { ListBoundary } from "@/components/admin/ListBoundary";
import { PagedListShell } from "@/components/admin/PagedListShell";
import { GlobeIcon, ServerIcon } from "@/components/icons";
import { RoleGate } from "@/components/RoleGate";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { InstanceFollow, InstanceFollowState } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import type { PlainMessageKey, Translate } from "@/lib/i18n";
import { useAsyncAction } from "@/lib/use-async-action";
import { usePagedList } from "@/lib/use-paged-list";

// AdminFederationInstancesView is PeerTube's instance follows (/server/following
// and /server/followers): this instance's actor follows other instances — their
// public videos arrive here once they accept — and other instances follow it,
// receiving its public videos. Admin only; every action is audited server-side.
export function AdminFederationInstancesView() {
  const t = useT();
  return (
    <RoleGate minRole="admin" action="manage instance follows">
      <div className="flex flex-col gap-10">
        <section aria-labelledby="instance-following-heading" className="flex flex-col gap-3">
          <h2 id="instance-following-heading" className="text-lg font-semibold tracking-tight text-fg">
            {t("admin.fedInstances.following")}
          </h2>
          <ListBoundary label="followed instances">
            <FollowingList />
          </ListBoundary>
        </section>
        <section aria-labelledby="instance-followers-heading" className="flex flex-col gap-3">
          <h2 id="instance-followers-heading" className="text-lg font-semibold tracking-tight text-fg">
            {t("admin.fedInstances.followers")}
          </h2>
          <ListBoundary label="instance followers">
            <FollowersList />
          </ListBoundary>
        </section>
      </div>
    </RoleGate>
  );
}

const STATE_BADGE: Record<InstanceFollowState, { labelKey: PlainMessageKey; variant: BadgeVariant }> = {
  pending: { labelKey: "admin.fedInstances.state.pending", variant: "warning" },
  accepted: { labelKey: "admin.fedInstances.state.accepted", variant: "success" },
  rejected: { labelKey: "admin.fedInstances.state.rejected", variant: "danger" },
};

function FollowingList() {
  const t = useT();
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
      errorMessage={t("admin.fedInstances.followingLoadError")}
      emptyIcon={<ServerIcon size={24} />}
      emptyTitle={t("admin.fedInstances.followingEmptyTitle")}
      emptyMessage={t("admin.fedInstances.followingEmptyMessage")}
    >
      <ul className="flex flex-col gap-2">
        {list.items.map((f) => (
          <li key={f.id}>
            <InstanceRow
              follow={f}
              actions={[
                {
                  id: "unfollow",
                  confirm: true,
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
  const t = useT();
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
      errorMessage={t("admin.fedInstances.followersLoadError")}
      emptyIcon={<GlobeIcon size={24} />}
      emptyTitle={t("admin.fedInstances.followersEmptyTitle")}
      emptyMessage={t("admin.fedInstances.followersEmptyMessage")}
    >
      <ul className="flex flex-col gap-2">
        {list.items.map((f) => {
          const accept: RowAction = {
            id: "accept",
            primary: true,
            confirm: true,
            run: async () => {
              await api.acceptInstanceFollower(f.id);
              setState(f.id, "accepted");
            },
          };
          const reject: RowAction = {
            id: "reject",
            confirm: true,
            run: async () => {
              await api.rejectInstanceFollower(f.id);
              setState(f.id, "rejected");
            },
          };
          const removeRow: RowAction = {
            id: "remove",
            confirm: true,
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
  const t = useT();
  const [host, setHost] = useState("");
  const { run, busy, error, clearError } = useAsyncAction(
    async (h: string) => {
      onFollowed(await api.followInstance(h));
      setHost("");
    },
    t("admin.fedInstances.followError"),
    (err) =>
      err instanceof ApiError && err.status === 422
        ? t("admin.fedInstances.invalidHost")
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
          aria-label={t("admin.fedInstances.hostLabel")}
          placeholder={t("admin.fedInstances.hostPlaceholder")}
          value={host}
          onChange={(e) => {
            setHost(e.target.value);
            clearError();
          }}
          className="focus-ring w-full max-w-xs rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg placeholder:text-fg-muted"
        />
        <Button type="submit" size="sm" disabled={busy || host.trim() === ""}>
          {busy ? t("admin.fedInstances.followBusy") : t("admin.fedInstances.follow")}
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

type RowAction = {
  id: "unfollow" | "accept" | "reject" | "remove";
  primary?: boolean;
  /** Ask first; the question is `actionCopy(...).confirm`. */
  confirm?: boolean;
  run: () => Promise<void>;
};

/** Every sentence a row action speaks, for one action on one host. */
function actionCopy(t: Translate, id: RowAction["id"], host: string) {
  switch (id) {
    case "unfollow":
      return {
        label: t("admin.fedInstances.unfollow.label"),
        confirm: t("admin.fedInstances.unfollow.confirm", { host }),
        confirmAria: t("admin.fedInstances.unfollow.confirmAria", { host }),
        aria: t("admin.fedInstances.unfollow.aria", { host }),
        error: t("admin.fedInstances.unfollow.error", { host }),
      };
    case "accept":
      return {
        label: t("admin.fedInstances.accept.label"),
        confirm: t("admin.fedInstances.accept.confirm", { host }),
        confirmAria: t("admin.fedInstances.accept.confirmAria", { host }),
        aria: t("admin.fedInstances.accept.aria", { host }),
        error: t("admin.fedInstances.accept.error", { host }),
      };
    case "reject":
      return {
        label: t("admin.fedInstances.reject.label"),
        confirm: t("admin.fedInstances.reject.confirm", { host }),
        confirmAria: t("admin.fedInstances.reject.confirmAria", { host }),
        aria: t("admin.fedInstances.reject.aria", { host }),
        error: t("admin.fedInstances.reject.error", { host }),
      };
    case "remove":
      return {
        label: t("admin.fedInstances.remove.label"),
        confirm: t("admin.fedInstances.remove.confirm", { host }),
        confirmAria: t("admin.fedInstances.remove.confirmAria", { host }),
        aria: t("admin.fedInstances.remove.aria", { host }),
        error: t("admin.fedInstances.remove.error", { host }),
      };
  }
}

function InstanceRow({ follow, actions }: { follow: InstanceFollow; actions: RowAction[] }) {
  const t = useT();
  const [confirming, setConfirming] = useState<RowAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const badge = STATE_BADGE[follow.state];
  const confirmCopy = confirming ? actionCopy(t, confirming.id, follow.host) : null;

  async function perform(action: RowAction) {
    setBusy(true);
    setError(null);
    try {
      await action.run();
      setConfirming(null);
    } catch (err) {
      setError(errorMessage(err, actionCopy(t, action.id, follow.host).error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-2xl bg-surface-muted p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-semibold tracking-tight text-fg">{follow.host}</span>
        <Badge variant={badge.variant}>{t(badge.labelKey)}</Badge>
        <span className="text-[13px] text-fg-muted">{t("admin.fedInstances.since", { when: relativeTime(follow.created_at) })}</span>
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
            <span className="text-sm text-fg-muted">{confirmCopy?.confirm}</span>
            <Button
              size="sm"
              variant={confirming.primary ? "primary" : "danger"}
              aria-label={confirmCopy?.confirmAria}
              disabled={busy}
              onClick={() => void perform(confirming)}
            >
              {confirmCopy?.label}
            </Button>
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => setConfirming(null)}>
              {t("common.cancel")}
            </Button>
          </>
        ) : (
          actions.map((a) => {
            const copy = actionCopy(t, a.id, follow.host);
            return (
              <Button
                key={a.id}
                size="sm"
                variant={a.primary ? "primary" : "secondary"}
                aria-label={copy.aria}
                disabled={busy}
                onClick={() => (a.confirm ? setConfirming(a) : void perform(a))}
              >
                {copy.label}
              </Button>
            );
          })
        )}
      </div>
    </article>
  );
}
