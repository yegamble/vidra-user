"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button, Card, Checkbox, ErrorState, Input, Select, Spinner } from "@/components/ui";
import { ApiError, api, errorMessage, type IPFSConfig, type IPFSConfigDocument } from "@/lib/api";

const numericFields = [
  { key: "budget_bytes", label: "Pin storage budget (GiB)", unit: 1024 ** 3, min: 1024 ** 2, max: 1024 ** 5 },
  { key: "min_free_bytes", label: "Keep disk space free (GiB)", unit: 1024 ** 3, min: 0, max: 1024 ** 5 },
  { key: "copy_bytes_per_second", label: "Background copy limit (MiB/s)", unit: 1024 ** 2, min: 65536, max: 1024 ** 3 },
  { key: "workers", label: "Pin workers", unit: 1, min: 1, max: 8 },
] as const;
type NumericDraft = Record<(typeof numericFields)[number]["key"], string>;
const publicationFields = [
  ["enabled", "Publish eligible public content"], ["auto_pin_new", "Pin new uploads"],
  ["demand_pin", "Pin older videos when requested"], ["backfill_enabled", "Fill the older catalogue in the background"],
] as const;

export function IPFSPolicyForm({ onSaved }: { onSaved: () => void }) {
  const [document, setDocument] = useState<IPFSConfigDocument | null>(null);
  const [draft, setDraft] = useState<IPFSConfig | null>(null);
  const [numbers, setNumbers] = useState<NumericDraft>({ budget_bytes: "", min_free_bytes: "", copy_bytes_per_second: "", workers: "" });
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const adopt = (value: IPFSConfigDocument) => {
    setDocument(value); setDraft(value.config);
    setNumbers(Object.fromEntries(numericFields.map(({ key, unit }) => [key, String(value.config[key] / unit)])) as NumericDraft);
  };
  useEffect(() => {
    const controller = new AbortController();
    api.getIPFSConfig(controller.signal).then((value) => {
      if (!controller.signal.aborted) { adopt(value); setConflict(false); setError(null); }
    }).catch((err: unknown) => {
      if (controller.signal.aborted) return;
      if (err instanceof ApiError && (err.status === 501 || err.status === 404)) setUnavailable(true);
      else setError(errorMessage(err, "Could not load IPFS policy."));
    });
    return () => controller.abort();
  }, [reload]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft || !document || busy || conflict) return;
    const config = { ...draft };
    for (const { key, unit, min, max } of numericFields) {
      const value = Number(numbers[key]) * unit;
      if (!numbers[key].trim() || !Number.isSafeInteger(value) || value < min || value > max) {
        setError("Enter values within the supported limits, using whole bytes and whole workers."); return;
      }
      config[key] = value;
    }
    setBusy(true); setError(null); setNotice(null);
    try {
      adopt(await api.updateIPFSConfig({ expected_revision: document.revision, config }));
      setNotice("Policy saved. Node status is reported separately.");
      onSaved();
    } catch (err) {
      const changed = err instanceof ApiError && err.status === 409;
      setConflict(changed);
      setError(changed ? "Settings changed elsewhere. Your draft is kept. Reload saved settings before saving again."
        : errorMessage(err, "Could not save IPFS policy."));
    } finally { setBusy(false); }
  };

  if (unavailable) return <p className="text-sm text-fg-muted">IPFS policy controls are not installed on this server.</p>;
  if (!draft || !document) return error ? <ErrorState message={error} onRetry={() => setReload((n) => n + 1)} />
    : <Spinner label="Loading IPFS publication policy" />;
  return (
    <Card className="max-w-4xl">
      <form aria-label="IPFS publication policy" className="flex flex-col gap-5" onSubmit={(event) => void save(event)}>
        <div>
          <h2 className="text-[15px] font-bold tracking-tight text-fg">IPFS publication policy</h2>
          <p className="mt-1 text-sm text-fg-muted">Public copies may remain on the network after deletion. Pausing publication keeps privacy withdrawals running.</p>
          <p className="mt-1 text-sm text-fg-muted">IPFS delivery is a separate setting under Media storage. Your primary storage remains authoritative.</p>
          {!document.policy_active ? <p className="mt-1 text-sm text-fg-muted">Existing deployment policy remains active until you save this policy.</p> : null}
        </div>
        <fieldset disabled={busy} className="flex flex-col gap-4">
          <Select label="Node provider" value={draft.provider} onChange={(event) => setDraft({ ...draft, provider: event.target.value as IPFSConfig["provider"] })}>
            <option value="internal">Managed internal node</option><option value="external">Configured external node</option>
          </Select>
          <div className="flex flex-col gap-3">
            {publicationFields.map(([key, label]) => <Checkbox key={key} label={label} checked={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.checked })} />)}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {numericFields.map(({ key, label, unit, min, max }) => <Input key={key} label={label} type="number" required step="any"
              min={min / unit} max={max / unit} value={numbers[key]} onChange={(event) => setNumbers({ ...numbers, [key]: event.target.value })} />)}
          </div>
          <p className="text-xs text-fg-muted">The copy limit controls background imports into the node, not all public IPFS traffic. The disk reserve and pin budget both limit new admissions.</p>
        </fieldset>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        {notice ? <p role="status" className="text-sm text-fg-muted">{notice}</p> : null}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={busy || conflict}>{busy ? "Saving…" : "Save IPFS policy"}</Button>
          {conflict ? <Button variant="secondary" onClick={() => setReload((n) => n + 1)}>Reload saved settings</Button> : null}
        </div>
      </form>
    </Card>
  );
}
