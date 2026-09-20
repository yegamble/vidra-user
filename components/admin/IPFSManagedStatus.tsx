"use client";

import { useEffect, useState } from "react";
import { Button, Spinner } from "@/components/ui";
import { api, errorMessage, type IPFSConfigDocument, type IPFSOperationRequest, type IPFSOperationResult, type IPFSStatus } from "@/lib/api";
import { formatBytes } from "@/lib/format";

type Action = "apply" | "restart";
type Operation = IPFSOperationResult["operation"];
const PAUSE_REASONS: Record<string, string> = {
  stale_capacity: "Waiting for a fresh storage measurement", node_unavailable: "Waiting for the IPFS node",
  capacity_unknown: "Storage usage is unavailable", configuration_pending: "Waiting for saved configuration to apply",
  disabled: "Publication is paused", publication_paused: "Publication is paused",
  policy_not_adopted: "Save the policy to enable managed pinning",
  recovering_interrupted_copy: "Recovering an interrupted copy before starting more pins",
  budget_exhausted: "Pin storage budget reached",
  filesystem_headroom: "Keeping the required disk space free", recovering_copy_cleanup: "Finishing interrupted pin cleanup",
};

export function IPFSManagedStatus({ document, dirty, onReload }: {
  document: IPFSConfigDocument; dirty: boolean; onReload: () => void;
}) {
  const [status, setStatus] = useState<IPFSStatus | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState<{ action: Action; body: IPFSOperationRequest } | null>(null);
  const [submitted, setSubmitted] = useState<Operation | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await api.getIPFSStatus(controller.signal);
        if (!controller.signal.aborted) { setStatus(next); setLoadError(null); }
      } catch (err) {
        if (!controller.signal.aborted) setLoadError(errorMessage(err, "Could not refresh node status."));
      } finally { if (!controller.signal.aborted) timer = setTimeout(() => void poll(), 5_000); }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [refresh, document.revision]);

  const management = status?.management;
  const operation = [document.operation, submitted, management?.operation]
    .filter((item): item is Operation => Boolean(item))
    .reduce<Operation | null>((latest, item) => !latest || item.sequence >= latest.sequence ? item : latest, null);
  const inFlight = operation?.state === "pending" || operation?.state === "running";
  const retry = attempt?.body.expected_revision === document.revision ? attempt : null;
  const disabled = busy || dirty || !document.policy_active || document.config.provider !== "internal"
    || !management?.available || Boolean(loadError) || inFlight;
  const run = async (action: Action) => {
    if (disabled || (retry && retry.action !== action)) return;
    const request = retry ?? { action, body: { expected_revision: document.revision, request_id: crypto.randomUUID() } };
    setAttempt(request); setBusy(true); setActionError(null);
    try {
      const result = await api.runIPFSOperation(action, request.body);
      setSubmitted(result.operation); setAttempt(null); setRefresh((n) => n + 1);
    } catch (err) {
      setActionError(errorMessage(err, "The operation result is uncertain. Retry uses the same request id."));
    } finally { setBusy(false); }
  };
  const capacity = status?.capacity;
  const queue = status?.queue;
  // formatBytes uses 1024-step units; match the policy's binary GiB/MiB inputs.
  const bytes = (value: number | null | undefined) => value == null ? "Unavailable" : formatBytes(value).replace(/([KMGTPE])B$/, "$1iB");
  const rows = [
    ["Desired node state", management?.desired_state ?? "Unavailable"],
    ["Observed node state", management?.observed_state ?? "Unavailable"],
    ["Applied / saved revision", management ? `${management.applied_config_revision} / ${document.revision}` : "Unavailable"],
    ["Last observation", management?.observed_at ?? "Unavailable"],
    ["Node operation", operation?.state ?? "None"],
    ["Node error", management?.last_error_code ?? "None reported"],
    ["Pin storage used", bytes(capacity?.repo_used_bytes)], ["Reserved for active pins", bytes(capacity?.reserved_bytes)],
    ["Pin budget", bytes(capacity?.budget_bytes)], ["Filesystem free", bytes(capacity?.filesystem_free_bytes)],
    ["Required free space", bytes(capacity?.min_free_bytes)],
    ["Admission pause reason", capacity?.admission_paused_reason ? PAUSE_REASONS[capacity.admission_paused_reason] ?? "Pinning paused" : (capacity ? "None reported" : "Unavailable")],
  ];
  const queueRows = queue ? [
    ["Copying now", queue.copying], ["New videos waiting", queue.queued_new],
    ["Requested videos waiting", queue.queued_demand], ["Waiting for capacity", queue.queued_capacity],
    ["Removed to free space", queue.evicted], ["Interrupted copies", queue.expired_claims],
    ["Read by active copies", bytes(queue.copied_bytes)],
  ] : [];
  return <section aria-label="Managed IPFS node" className="flex flex-col gap-4 border-t border-border pt-5">
    <h3 className="text-sm font-semibold text-fg">Node and pin storage</h3>
    {!status && !loadError ? <Spinner label="Loading node status" /> : null}
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      {rows.map(([label, value]) => <div key={label}><dt className="text-fg-muted">{label}</dt><dd className="break-words text-fg">{value}</dd></div>)}
    </dl>
    {queue ? <div className="flex flex-col gap-3">
      <h4 className="text-sm font-semibold text-fg">Public pin queue</h4>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {queueRows.map(([label, value]) => <div key={label}><dt className="text-fg-muted">{label}</dt><dd className="break-words text-fg">{value}</dd></div>)}
      </dl>
      <p className="text-xs text-fg-muted">Bytes read may include incomplete copies. A video is available through IPFS after its full copy is pinned.</p>
    </div> : null}
    <p className="text-xs text-fg-muted">Publication may be paused while the node stays running to withdraw private content and serve retained public pins.</p>
    {dirty || !document.policy_active ? <p className="text-sm text-fg-muted">Save the policy before operating the node.</p> : null}
    {document.config.provider === "external" ? <p className="text-sm text-fg-muted">External node lifecycle is managed outside Vidra.</p> : null}
    {management && !management.available && document.config.provider === "internal" ? <p className="text-sm text-fg-muted">Managed node controls need an installed and reachable host manager.</p> : null}
    {loadError || actionError ? <p role="alert" className="text-sm text-danger">{loadError ?? actionError}</p> : null}
    <div className="flex flex-wrap gap-3">
      <Button variant="secondary" onClick={() => setRefresh((n) => n + 1)}>Refresh node status</Button>
      {(["apply", "restart"] as const).map((action) => <Button key={action} variant="secondary"
        disabled={disabled || Boolean(retry && retry.action !== action)} onClick={() => void run(action)}>
        {retry?.action === action ? `Retry ${action} request` : action === "apply" ? "Apply saved configuration" : "Restart internal node"}
      </Button>)}
      {actionError ? <Button variant="secondary" onClick={onReload}>Reload saved settings</Button> : null}
    </div>
  </section>;
}
