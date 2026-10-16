"use client";

import { useState } from "react";

import { useT } from "@/components/I18nProvider";
import { ListBoundary } from "@/components/admin/ListBoundary";
import { PagedListShell } from "@/components/admin/PagedListShell";
import { ServerIcon } from "@/components/icons";
import { RoleGate } from "@/components/RoleGate";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { ApiError, api } from "@/lib/api";
import type { BlocklistSubscription, BlocklistSyncResult } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import type { PlainMessageKey, Translate } from "@/lib/i18n";
import { useAsyncAction } from "@/lib/use-async-action";
import { usePagedList } from "@/lib/use-paged-list";

const FORMATS = [
  { value: "mastodon_csv", labelKey: "admin.blocklists.format.mastodonCsv" },
  { value: "domain_list", labelKey: "admin.blocklists.format.domainList" },
  { value: "json", labelKey: "admin.blocklists.format.json" },
] as const satisfies readonly { value: string; labelKey: PlainMessageKey }[];

/** One sentence for the outcome of a sync, for the row's live region. */
export function syncSummary(r: BlocklistSyncResult, t: Translate): string {
  if (r.status === "needs_confirmation")
    return t("admin.blocklists.sync.held", { count: String(r.pending_removals ?? t("admin.blocklists.sync.many")) });
  if (r.status === "error")
    return t("admin.blocklists.sync.failed", { error: r.error ?? t("admin.blocklists.sync.unknownError") });
  if (r.status === "not_modified") return t("admin.blocklists.sync.upToDate");
  const ignored =
    r.ignored_severity > 0 ? t("admin.blocklists.sync.ignored", { count: String(r.ignored_severity) }) : "";
  return t("admin.blocklists.sync.done", { added: r.added, removed: r.removed, ignored });
}

// AdminBlocklistSubscriptionsView: admin-only management of shared blocklists
// (add, enable/disable, sync now, remove) plus the allowlist that exempts a
// domain from every list. Removing a subscription removes only the blocks it
// created; the server says so, and so does the confirm text here.
export function AdminBlocklistSubscriptionsView() {
  return (
    <RoleGate minRole="admin" action="manage blocklist subscriptions">
      <div className="flex flex-col gap-10">
        <ListBoundary label="blocklist subscriptions">
          <SubscriptionList />
        </ListBoundary>
        <ListBoundary label="allowlist">
          <AllowList />
        </ListBoundary>
      </div>
    </RoleGate>
  );
}

function SubscriptionList() {
  const t = useT();
  const list = usePagedList<BlocklistSubscription>({
    load: (query, signal) =>
      api
        .getBlocklistSubscriptions({ limit: query.limit, offset: query.offset }, signal)
        .then((res) => ({
          items: res.subscriptions,
          total: res.total,
          limit: res.limit,
          offset: res.offset,
        })),
  });
  return (
    <PagedListShell
      list={list}
      noun="subscription"
      toolbar={<AddForm onAdded={list.prepend} />}
      errorMessage={t("admin.blocklists.loadError")}
      emptyIcon={<ServerIcon size={24} />}
      emptyTitle={t("admin.blocklists.emptyTitle")}
      emptyMessage={t("admin.blocklists.emptyMessage")}
    >
      <ul className="flex flex-col gap-2">
        {list.items.map((sub) => (
          <li key={sub.id}>
            <SubscriptionRow
              sub={sub}
              onChanged={(next) =>
                list.patch((rows) => rows.map((r) => (r.id === next.id ? next : r)))
              }
              onRemoved={(id) => list.drop((s) => s.id !== id)}
            />
          </li>
        ))}
      </ul>
    </PagedListShell>
  );
}

function AddForm({ onAdded }: { onAdded: (sub: BlocklistSubscription) => void }) {
  const t = useT();
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [format, setFormat] = useState<string>("mastodon_csv");
  const { run, busy, error, clearError } = useAsyncAction(
    async () => {
      const created = await api.createBlocklistSubscription({
        url: url.trim(),
        label: label.trim() || undefined,
        format: format as (typeof FORMATS)[number]["value"],
      });
      setUrl("");
      setLabel("");
      onAdded(created);
    },
    t("admin.blocklists.addError"),
    (err) => {
      if (!(err instanceof ApiError)) return null;
      if (err.status === 409) return t("admin.blocklists.alreadySubscribed");
      if (err.status === 422) return t("admin.blocklists.invalidUrl");
      return null;
    },
  );
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (url.trim() === "" || busy) return;
        void run();
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <input
          type="url"
          aria-label={t("admin.blocklists.urlLabel")}
          placeholder="https://example.org/blocklist.csv"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            clearError();
          }}
          className="focus-ring w-full max-w-sm rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg placeholder:text-fg-muted"
        />
        <input
          type="text"
          aria-label={t("admin.blocklists.nameLabel")}
          placeholder={t("admin.blocklists.nameLabel")}
          maxLength={200}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="focus-ring w-full max-w-[12rem] rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg placeholder:text-fg-muted"
        />
        <Select
          label={t("admin.blocklists.formatLabel")}
          value={format}
          onChange={(e) => setFormat(e.target.value)}
        >
          {FORMATS.map((f) => (
            <option key={f.value} value={f.value}>
              {t(f.labelKey)}
            </option>
          ))}
        </Select>
        <Button type="submit" size="sm" disabled={busy || url.trim() === ""}>
          {busy ? t("admin.blocklists.adding") : t("admin.blocklists.add")}
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

function statusBadge(sub: BlocklistSubscription, t: Translate) {
  switch (sub.last_status) {
    case "ok":
      return <Badge variant="success">{t("admin.blocklists.status.synced")}</Badge>;
    case "not_modified":
      return <Badge variant="success">{t("admin.blocklists.status.upToDate")}</Badge>;
    case "error":
      return <Badge variant="danger">{t("admin.blocklists.status.failed")}</Badge>;
    case "needs_confirmation":
      return <Badge variant="warning">{t("admin.blocklists.status.held")}</Badge>;
    default:
      return <Badge variant="neutral">{t("admin.blocklists.status.never")}</Badge>;
  }
}

function SubscriptionRow({
  sub,
  onChanged,
  onRemoved,
}: {
  sub: BlocklistSubscription;
  onChanged: (next: BlocklistSubscription) => void;
  onRemoved: (id: string) => void;
}) {
  const t = useT();
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const name = sub.label || sub.url;

  const [held, setHeld] = useState(false);
  const sync = useAsyncAction(
    async (confirm?: boolean) => {
      const res = await api.syncBlocklistSubscription(sub.id, confirm === true);
      setHeld(res.status === "needs_confirmation");
      setMessage(syncSummary(res, t));
      // Fold the outcome into the row in place; a reload would blank the list
      // and take the outcome message with it.
      const ok = res.status === "ok";
      const failed = res.status === "error" || res.status === "needs_confirmation";
      onChanged({
        ...sub,
        last_status: res.status,
        last_error: failed ? res.error : undefined,
        last_synced_at: failed ? sub.last_synced_at : new Date().toISOString(),
        last_added: ok ? res.added : sub.last_added,
        last_removed: ok ? res.removed : sub.last_removed,
        entry_count: ok ? res.entries : sub.entry_count,
        block_count: ok ? Math.max(0, sub.block_count + res.added - res.removed) : sub.block_count,
      });
    },
    t("admin.blocklists.syncError"),
    (err) =>
      err instanceof ApiError && err.status === 429
        ? t("admin.blocklists.rateLimited")
        : null,
  );
  const toggle = useAsyncAction(async () => {
    const next = await api.updateBlocklistSubscription(sub.id, { enabled: !sub.enabled });
    // PATCH returns the row without the owned-block count; keep ours.
    onChanged({ ...next, block_count: sub.block_count });
  }, t("admin.blocklists.updateError"));
  const remove = useAsyncAction(async () => {
    await api.deleteBlocklistSubscription(sub.id);
    onRemoved(sub.id);
  }, t("admin.blocklists.removeError"));

  const error = sync.error ?? toggle.error ?? remove.error;
  const busy = sync.busy || toggle.busy || remove.busy;
  const blocks = t("admin.blocklists.blockCount", { count: String(sub.block_count) });

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-surface-muted p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight text-fg">{name}</p>
          {sub.label ? <p className="truncate text-[13px] text-fg-muted">{sub.url}</p> : null}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-fg-muted">
            {statusBadge(sub, t)}
            {!sub.enabled ? <Badge variant="neutral">{t("admin.blocklists.paused")}</Badge> : null}
            <span>
              {t("admin.blocklists.fromList", { blocks })}
            </span>
            {sub.last_synced_at ? <span>{t("admin.blocklists.syncedAgo", { when: relativeTime(sub.last_synced_at) })}</span> : null}
          </div>
          {(sub.last_status === "error" || sub.last_status === "needs_confirmation") && sub.last_error ? (
            <p className="mt-1 text-[13px] text-danger">{sub.last_error}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            aria-label={t("admin.blocklists.syncAria", { name })}
            onClick={() => void sync.run(false)}
          >
            {sync.busy ? t("admin.blocklists.syncing") : t("admin.blocklists.syncNow")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            aria-label={t(sub.enabled ? "admin.blocklists.pauseAria" : "admin.blocklists.resumeAria", { name })}
            onClick={() => void toggle.run()}
          >
            {sub.enabled ? t("admin.blocklists.pause") : t("admin.blocklists.resume")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            aria-label={t("admin.blocklists.removeAria", { name })}
            onClick={() => setConfirming(true)}
          >
            {t("admin.blocklists.remove")}
          </Button>
        </div>
      </div>
      {confirming ? (
        <div role="alertdialog" aria-label={t("admin.blocklists.confirmRemoveAria", { name })} className="flex flex-wrap items-center gap-2 text-[13px] text-fg">
          <span>
            {t("admin.blocklists.confirmRemove", { blocks })}
          </span>
          <Button size="sm" disabled={remove.busy} onClick={() => void remove.run()}>
            {remove.busy ? t("admin.blocklists.removing") : t("admin.blocklists.removeConfirm")}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setConfirming(false)}>
            {t("admin.blocklists.keep")}
          </Button>
        </div>
      ) : null}
      <p role="status" className="text-[13px] text-fg-muted empty:hidden">
        {message}
      </p>
      {held || sub.last_status === "needs_confirmation" ? (
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-fg">
          <span>{t("admin.blocklists.heldHint")}</span>
          <Button size="sm" disabled={busy} onClick={() => void sync.run(true)}>
            {t("admin.blocklists.applyAnyway")}
          </Button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function AllowList() {
  const t = useT();
  const list = usePagedList<{ domain: string; added_at: string }>({
    load: (query, signal) =>
      api
        .getBlocklistAllowlist({ limit: query.limit, offset: query.offset }, signal)
        .then((res) => ({
          items: res.domains,
          total: res.total,
          limit: res.limit,
          offset: res.offset,
        })),
  });
  return (
    <section aria-label={t("admin.allowlist.title")} className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-fg">{t("admin.allowlist.title")}</h2>
        <p className="text-[13px] text-fg-muted">
          {t("admin.allowlist.intro")}
        </p>
      </div>
      <PagedListShell
        list={list}
        noun="allowed domain"
        toolbar={<AllowForm onAdded={list.prepend} />}
        errorMessage={t("admin.allowlist.loadError")}
        emptyIcon={<ServerIcon size={24} />}
        emptyTitle={t("admin.allowlist.emptyTitle")}
        emptyMessage={t("admin.allowlist.emptyMessage")}
      >
        <ul className="flex flex-col gap-2">
          {list.items.map((d) => (
            <li key={d.domain}>
              <AllowRow domain={d.domain} onRemoved={() => list.drop((x) => x.domain !== d.domain)} />
            </li>
          ))}
        </ul>
      </PagedListShell>
    </section>
  );
}

function AllowForm({ onAdded }: { onAdded: (row: { domain: string; added_at: string }) => void }) {
  const t = useT();
  const [domain, setDomain] = useState("");
  const { run, busy, error, clearError } = useAsyncAction(
    async (d: string) => {
      await api.addBlocklistAllow({ domain: d });
      setDomain("");
      onAdded({ domain: d, added_at: new Date().toISOString() });
    },
    t("admin.allowlist.addError"),
    (err) =>
      err instanceof ApiError && err.status === 422
        ? t("admin.instances.invalidDomain")
        : null,
  );
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const d = domain.trim().toLowerCase();
        if (d === "" || busy) return;
        void run(d);
      }}
    >
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          aria-label={t("admin.allowlist.domainLabel")}
          placeholder={t("admin.allowlist.domainPlaceholder")}
          value={domain}
          onChange={(e) => {
            setDomain(e.target.value);
            clearError();
          }}
          className="focus-ring w-full max-w-sm rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg placeholder:text-fg-muted"
        />
        <Button type="submit" size="sm" disabled={busy || domain.trim() === ""}>
          {busy ? t("admin.blocklists.adding") : t("admin.allowlist.exempt")}
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

function AllowRow({ domain, onRemoved }: { domain: string; onRemoved: () => void }) {
  const t = useT();
  const { run, busy, error } = useAsyncAction(async () => {
    await api.removeBlocklistAllow(domain);
    onRemoved();
  }, t("admin.allowlist.removeError"));
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-muted p-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold tracking-tight text-fg">{domain}</p>
        {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
      </div>
      <Button
        variant="secondary"
        size="sm"
        className="shrink-0"
        disabled={busy}
        aria-label={t("admin.allowlist.stopAria", { domain })}
        onClick={() => void run()}
      >
        {t("admin.blocklists.remove")}
      </Button>
    </div>
  );
}

