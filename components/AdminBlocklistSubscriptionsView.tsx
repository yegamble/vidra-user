"use client";

import { useState } from "react";

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
import { useAsyncAction } from "@/lib/use-async-action";
import { usePagedList } from "@/lib/use-paged-list";

const FORMATS = [
  { value: "mastodon_csv", label: "Mastodon CSV" },
  { value: "domain_list", label: "Plain domain list" },
  { value: "json", label: "JSON" },
] as const;

/** One sentence for the outcome of a sync, for the row's live region. */
export function syncSummary(r: BlocklistSyncResult): string {
  if (r.status === "error") return `Sync failed: ${r.error ?? "unknown error"}.`;
  if (r.status === "not_modified") return "Already up to date.";
  const ignored = r.ignored_severity > 0 ? `, ${r.ignored_severity} ignored (silence/limit)` : "";
  return `Synced: ${r.added} added, ${r.removed} removed${ignored}.`;
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
      errorMessage="Could not load blocklist subscriptions."
      emptyIcon={<ServerIcon size={24} />}
      emptyTitle="No blocklist subscriptions"
      emptyMessage="Add the URL of a shared blocklist above to keep this server's instance blocklist in step with it."
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
    "Could not add this subscription.",
    (err) => {
      if (!(err instanceof ApiError)) return null;
      if (err.status === 409) return "You are already subscribed to that URL.";
      if (err.status === 422) return "Enter a public http(s) URL and pick the list's format.";
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
          aria-label="Blocklist URL"
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
          aria-label="Name (optional)"
          placeholder="Name (optional)"
          maxLength={200}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="focus-ring w-full max-w-[12rem] rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg placeholder:text-fg-muted"
        />
        <Select
          label="List format"
          value={format}
          onChange={(e) => setFormat(e.target.value)}
        >
          {FORMATS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </Select>
        <Button type="submit" size="sm" disabled={busy || url.trim() === ""}>
          {busy ? "Adding…" : "Add list"}
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

function statusBadge(sub: BlocklistSubscription) {
  switch (sub.last_status) {
    case "ok":
      return <Badge variant="success">Synced</Badge>;
    case "not_modified":
      return <Badge variant="success">Up to date</Badge>;
    case "error":
      return <Badge variant="danger">Last sync failed</Badge>;
    default:
      return <Badge variant="neutral">Not synced yet</Badge>;
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
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const name = sub.label || sub.url;

  const sync = useAsyncAction(
    async () => {
      const res = await api.syncBlocklistSubscription(sub.id);
      setMessage(syncSummary(res));
      // Fold the outcome into the row in place; a reload would blank the list
      // and take the outcome message with it.
      const ok = res.status === "ok";
      onChanged({
        ...sub,
        last_status: res.status,
        last_error: res.status === "error" ? res.error : undefined,
        last_synced_at: res.status === "error" ? sub.last_synced_at : new Date().toISOString(),
        last_added: ok ? res.added : sub.last_added,
        last_removed: ok ? res.removed : sub.last_removed,
        entry_count: ok ? res.entries : sub.entry_count,
        block_count: ok ? Math.max(0, sub.block_count + res.added - res.removed) : sub.block_count,
      });
    },
    "Could not sync this list.",
    (err) =>
      err instanceof ApiError && err.status === 429
        ? "Too many sync requests. Wait a minute and try again."
        : null,
  );
  const toggle = useAsyncAction(async () => {
    const next = await api.updateBlocklistSubscription(sub.id, { enabled: !sub.enabled });
    // PATCH returns the row without the owned-block count; keep ours.
    onChanged({ ...next, block_count: sub.block_count });
  }, "Could not update this subscription.");
  const remove = useAsyncAction(async () => {
    await api.deleteBlocklistSubscription(sub.id);
    onRemoved(sub.id);
  }, "Could not remove this subscription.");

  const error = sync.error ?? toggle.error ?? remove.error;
  const busy = sync.busy || toggle.busy || remove.busy;

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-surface-muted p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight text-fg">{name}</p>
          {sub.label ? <p className="truncate text-[13px] text-fg-muted">{sub.url}</p> : null}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-fg-muted">
            {statusBadge(sub)}
            {!sub.enabled ? <Badge variant="neutral">Paused</Badge> : null}
            <span>
              {sub.block_count} {sub.block_count === 1 ? "block" : "blocks"} from this list
            </span>
            {sub.last_synced_at ? <span>synced {relativeTime(sub.last_synced_at)}</span> : null}
          </div>
          {sub.last_status === "error" && sub.last_error ? (
            <p className="mt-1 text-[13px] text-danger">{sub.last_error}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            aria-label={`Sync ${name} now`}
            onClick={() => void sync.run()}
          >
            {sync.busy ? "Syncing…" : "Sync now"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            aria-label={`${sub.enabled ? "Pause" : "Resume"} ${name}`}
            onClick={() => void toggle.run()}
          >
            {sub.enabled ? "Pause" : "Resume"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            aria-label={`Remove ${name}`}
            onClick={() => setConfirming(true)}
          >
            Remove
          </Button>
        </div>
      </div>
      {confirming ? (
        <div role="alertdialog" aria-label={`Confirm removing ${name}`} className="flex flex-wrap items-center gap-2 text-[13px] text-fg">
          <span>
            This removes the list and the {sub.block_count} {sub.block_count === 1 ? "block" : "blocks"} it
            created. Blocks you added by hand stay.
          </span>
          <Button size="sm" disabled={remove.busy} onClick={() => void remove.run()}>
            {remove.busy ? "Removing…" : "Remove list and its blocks"}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setConfirming(false)}>
            Keep
          </Button>
        </div>
      ) : null}
      <p role="status" className="text-[13px] text-fg-muted empty:hidden">
        {message}
      </p>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function AllowList() {
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
    <section aria-label="Allowlist" className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-fg">Allowlist</h2>
        <p className="text-[13px] text-fg-muted">
          Domains here are never blocked by a subscription, and a block a list already added is lifted.
          Blocks you added by hand are not affected.
        </p>
      </div>
      <PagedListShell
        list={list}
        noun="allowed domain"
        toolbar={<AllowForm onAdded={list.prepend} />}
        errorMessage="Could not load the allowlist."
        emptyIcon={<ServerIcon size={24} />}
        emptyTitle="Nothing exempt"
        emptyMessage="Exempt a domain above if a shared list blocks an instance you want to keep."
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
  const [domain, setDomain] = useState("");
  const { run, busy, error, clearError } = useAsyncAction(
    async (d: string) => {
      await api.addBlocklistAllow({ domain: d });
      setDomain("");
      onAdded({ domain: d, added_at: new Date().toISOString() });
    },
    "Could not add this domain.",
    (err) =>
      err instanceof ApiError && err.status === 422
        ? "Enter a valid instance domain (a bare hostname, optionally host:port)."
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
          aria-label="Domain to exempt from blocklists"
          placeholder="Domain to exempt, e.g. friend.example"
          value={domain}
          onChange={(e) => {
            setDomain(e.target.value);
            clearError();
          }}
          className="focus-ring w-full max-w-sm rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg placeholder:text-fg-muted"
        />
        <Button type="submit" size="sm" disabled={busy || domain.trim() === ""}>
          {busy ? "Adding…" : "Exempt"}
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
  const { run, busy, error } = useAsyncAction(async () => {
    await api.removeBlocklistAllow(domain);
    onRemoved();
  }, "Could not remove this exemption.");
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
        aria-label={`Stop exempting ${domain}`}
        onClick={() => void run()}
      >
        Remove
      </Button>
    </div>
  );
}

