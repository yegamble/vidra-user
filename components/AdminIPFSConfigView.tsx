"use client";

import { useCallback, useEffect, useState } from "react";

import { RoleGate } from "@/components/RoleGate";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api, errorMessage } from "@/lib/api";
import type {
  IPFSClassPinCounts,
  IPFSNetworkStatus,
  IPFSPinCounts,
  IPFSReconcileResult,
  IPFSStatus,
} from "@/lib/api";
import { formatCount } from "@/lib/format";

type LoadState = "loading" | "ready" | "disabled" | "error";
type ReconcileScope = "all" | "public" | "private";

export function AdminIPFSConfigView() {
  return (
    <RoleGate minRole="admin" action="configure IPFS mirroring">
      <IPFSConfigPanel />
    </RoleGate>
  );
}

// Exported for component tests; production always enters through the role gate.
export function IPFSConfigPanel() {
  const [state, setState] = useState<LoadState>("loading");
  const [status, setStatus] = useState<IPFSStatus | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [reconciling, setReconciling] = useState<ReconcileScope | null>(null);
  const [reconcileResult, setReconcileResult] = useState<{
    scope: ReconcileScope;
    result: IPFSReconcileResult;
  } | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getIPFSStatus(controller.signal)
      .then((data) => {
        setStatus(data);
        setState("ready");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 503) {
          setStatus(null);
          setState("disabled");
          return;
        }
        setState("error");
      });
    return () => controller.abort();
  }, [reloadKey]);

  const refresh = useCallback(() => {
    setState("loading");
    setOperationError(null);
    setReloadKey((key) => key + 1);
  }, []);

  const reconcile = useCallback(async (scope: ReconcileScope) => {
    setReconciling(scope);
    setOperationError(null);
    setReconcileResult(null);
    try {
      const result = await api.reconcileIPFS(scope === "all" ? undefined : scope);
      setReconcileResult({ scope, result });
      setReloadKey((key) => key + 1);
    } catch (err) {
      setOperationError(errorMessage(err, "Could not reconcile the IPFS mirror."));
    } finally {
      setReconciling(null);
    }
  }, []);

  if (state === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Spinner label="Loading IPFS configuration" />
      </div>
    );
  }

  if (state === "error") {
    return <ErrorState message="Could not load IPFS configuration." onRetry={refresh} />;
  }

  if (state === "disabled" || status === null) {
    return (
      <div className="flex max-w-3xl flex-col gap-6">
        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] font-bold tracking-tight text-fg">IPFS mirror</h2>
            <Badge variant="neutral">Not configured</Badge>
          </div>
          <p className="text-sm leading-relaxed text-fg-muted">
            Neither the public distribution mirror nor the private replication tier is enabled.
            Media continues to use the authoritative local or S3 storage backend.
          </p>
        </Card>
        <ConfigurationHelp />
      </div>
    );
  }

  const publicNetwork = status.networks.public;
  const privateNetwork = status.networks.private;

  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <section aria-labelledby="ipfs-overview-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3 px-0.5">
          <div>
            <div className="flex items-center gap-2">
              <h2 id="ipfs-overview-heading" className="text-[15px] font-bold tracking-tight text-fg">
                Mirror overview
              </h2>
              <Badge variant="success">Configured</Badge>
            </div>
            <p className="mt-1 text-[13px] text-fg-muted">
              IPFS is a bandwidth-saving mirror. Local or S3 storage remains authoritative.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={refresh}>
            Refresh
          </Button>
        </div>

        <Card className="flex flex-col gap-4">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <ConfigRow
              label="Public gateway"
              value={publicNetwork.enabled && status.gateway_url ? status.gateway_url : "Not configured"}
              mono={Boolean(status.gateway_url)}
            />
            <ConfigRow
              label="Configured tiers"
              value={configuredTiers(publicNetwork, privateNetwork)}
            />
          </dl>
          <PinSummary pins={status.pins} />
        </Card>
      </section>

      <section aria-labelledby="ipfs-networks-heading" className="flex flex-col gap-3">
        <div className="px-0.5">
          <h2 id="ipfs-networks-heading" className="text-[15px] font-bold tracking-tight text-fg">
            Networks
          </h2>
          <p className="mt-1 text-[13px] text-fg-muted">
            Public content is distributed through a gateway. Private content stays on the isolated
            swarm and never exposes a gateway or CID to viewers.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <NetworkCard
            name="Public distribution"
            network="public"
            status={publicNetwork}
            reconciling={reconciling}
            onReconcile={reconcile}
          />
          <NetworkCard
            name="Private replication"
            network="private"
            status={privateNetwork}
            reconciling={reconciling}
            onReconcile={reconcile}
          />
        </div>
      </section>

      <section aria-labelledby="ipfs-operations-heading" className="flex flex-col gap-3">
        <div className="px-0.5">
          <h2 id="ipfs-operations-heading" className="text-[15px] font-bold tracking-tight text-fg">
            Reconciliation
          </h2>
          <p className="mt-1 text-[13px] text-fg-muted">
            Re-arm failed work and enqueue eligible objects that are missing from the pin ledger.
            The operation is audited and idempotent.
          </p>
        </div>
        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void reconcile("all")} disabled={reconciling !== null}>
              {reconciling === "all" ? "Reconciling…" : "Reconcile all configured tiers"}
            </Button>
            {reconciling !== null ? <Spinner label={`Reconciling ${reconciling} IPFS mirror`} /> : null}
          </div>
          {reconcileResult ? <ReconcileNotice {...reconcileResult} /> : null}
          {operationError ? (
            <p role="alert" className="text-sm text-danger">
              {operationError}
            </p>
          ) : null}
        </Card>
      </section>

      <ConfigurationHelp />
    </div>
  );
}

function NetworkCard({
  name,
  network,
  status,
  reconciling,
  onReconcile,
}: {
  name: string;
  network: "public" | "private";
  status: IPFSNetworkStatus;
  reconciling: ReconcileScope | null;
  onReconcile: (scope: ReconcileScope) => Promise<void>;
}) {
  const health = networkHealth(status);
  return (
    <Card className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold tracking-tight text-fg">{name}</h3>
            <Badge variant={health.variant}>{health.label}</Badge>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-fg-muted">
            {network === "public"
              ? "Public, published media and identity assets."
              : "Private and unlisted media on a swarm.key-isolated network."}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={!status.enabled || reconciling !== null}
          onClick={() => void onReconcile(network)}
        >
          {reconciling === network ? "Reconciling…" : `Reconcile ${network}`}
        </Button>
      </div>

      <dl className="grid grid-cols-1 gap-x-5 gap-y-2 text-sm sm:grid-cols-2">
        <ConfigRow
          label="Kubo node"
          value={!status.enabled ? "Not configured" : status.node_reachable ? "Reachable" : "Unreachable"}
        />
        <ConfigRow
          label="Cluster"
          value={
            !status.cluster_enabled
              ? "Not configured"
              : status.cluster_reachable
                ? "Reachable"
                : "Unreachable"
          }
        />
      </dl>

      <PinSummary pins={status.pins} />
      <ClassCounts classes={status.by_class} />
    </Card>
  );
}

function PinSummary({ pins }: { pins: IPFSPinCounts }) {
  const stats = [
    ["Pinned", pins.pinned, "text-success"],
    ["Pending", pins.pending, "text-fg"],
    ["Failed", pins.failed, pins.failed > 0 ? "text-danger" : "text-fg"],
    ["Unpinned", pins.unpinned, "text-fg"],
  ] as const;
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {stats.map(([label, value, color]) => (
        <div key={label} className="rounded-xl bg-surface-muted px-3 py-2.5">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.04em] text-fg-subtle">
            {label}
          </dt>
          <dd className={`mt-0.5 text-lg font-bold tabular-nums ${color}`}>{formatCount(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function ClassCounts({ classes }: { classes: IPFSClassPinCounts[] }) {
  if (classes.length === 0) {
    return <p className="text-xs text-fg-muted">No pin-ledger entries for this network yet.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border-subtle">
      <table className="w-full min-w-[430px] text-left text-xs">
        <caption className="sr-only">Pin counts by media class</caption>
        <thead className="bg-surface-muted text-fg-subtle">
          <tr>
            <th className="px-3 py-2 font-semibold">Media class</th>
            <th className="px-2 py-2 text-right font-semibold">Pinned</th>
            <th className="px-2 py-2 text-right font-semibold">Pending</th>
            <th className="px-2 py-2 text-right font-semibold">Failed</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {classes.map((row) => (
            <tr key={row.media_class}>
              <th className="px-3 py-2 font-medium text-fg">{mediaClassLabel(row.media_class)}</th>
              <td className="px-2 py-2 text-right tabular-nums text-fg-muted">{formatCount(row.pinned)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-fg-muted">{formatCount(row.pending)}</td>
              <td className={`px-2 py-2 text-right tabular-nums ${row.failed > 0 ? "text-danger" : "text-fg-muted"}`}>
                {formatCount(row.failed)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReconcileNotice({
  scope,
  result,
}: {
  scope: ReconcileScope;
  result: IPFSReconcileResult;
}) {
  const classCount = Object.keys(result.by_class).length;
  return (
    <p role="status" className="text-sm text-success">
      Reconciliation accepted for {scope === "all" ? "all configured tiers" : `${scope} IPFS`}: queued{" "}
      {formatCount(result.enqueued)} {result.enqueued === 1 ? "pin intent" : "pin intents"}
      {classCount > 0 ? ` across ${formatCount(classCount)} media classes` : ""}.
    </p>
  );
}

function ConfigurationHelp() {
  return (
    <section aria-labelledby="ipfs-boot-config-heading" className="flex flex-col gap-3">
      <div className="px-0.5">
        <div className="flex items-center gap-2">
          <h2 id="ipfs-boot-config-heading" className="text-[15px] font-bold tracking-tight text-fg">
            Boot configuration
          </h2>
          <Badge variant="neutral">Restart required</Badge>
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">
          Node endpoints, gateway URLs, cluster credentials, and private swarm keys are deployment
          settings. Change them in the server environment and restart the API; secrets are never
          returned to this page.
        </p>
      </div>
      <Card>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <BootSetting
            title="Public distribution"
            variables="IPFS_ENABLED · IPFS_API_URL · IPFS_GATEWAY_URL"
            optional="Optional: IPFS_CLUSTER_API_URL and cluster token"
          />
          <BootSetting
            title="Private replication"
            variables="IPFS_MIRROR_PRIVATE · IPFS_PRIVATE_API_URL"
            optional="Optional: private cluster URL/token; swarm.key stays node-side"
          />
        </dl>
      </Card>
    </section>
  );
}

function BootSetting({ title, variables, optional }: { title: string; variables: string; optional: string }) {
  return (
    <div>
      <dt className="font-semibold text-fg">{title}</dt>
      <dd className="mt-1 break-words font-mono text-xs leading-relaxed text-fg-muted">{variables}</dd>
      <dd className="mt-1 text-xs leading-relaxed text-fg-subtle">{optional}</dd>
    </div>
  );
}

function ConfigRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3 border-b border-border-subtle py-1.5">
      <dt className="shrink-0 text-fg-muted">{label}</dt>
      <dd className={`min-w-0 break-all text-right text-fg ${mono ? "font-mono text-xs" : "tabular-nums"}`}>
        {value}
      </dd>
    </div>
  );
}

function configuredTiers(publicNetwork: IPFSNetworkStatus, privateNetwork: IPFSNetworkStatus): string {
  const tiers = [
    publicNetwork.enabled ? "Public" : null,
    privateNetwork.enabled ? "Private" : null,
  ].filter(Boolean);
  return tiers.length > 0 ? tiers.join(" + ") : "None";
}

function networkHealth(status: IPFSNetworkStatus): { label: string; variant: BadgeVariant } {
  if (!status.enabled) return { label: "Off", variant: "neutral" };
  if (!status.node_reachable) return { label: "Node unreachable", variant: "danger" };
  if (status.cluster_enabled && !status.cluster_reachable) {
    return { label: "Cluster unreachable", variant: "warning" };
  }
  return { label: "Healthy", variant: "success" };
}

function mediaClassLabel(value: string): string {
  const words = value.replace(/[_-]+/g, " ").trim();
  return words === "" ? "Unknown" : words.charAt(0).toUpperCase() + words.slice(1);
}
