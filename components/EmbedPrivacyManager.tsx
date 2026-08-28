"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { CloseIcon } from "@/components/icons";
import { ApiError, api } from "@/lib/api";
import type { EmbedPrivacyStatus } from "@/lib/api";
import { normalizeDomain } from "@/lib/embed-privacy";
import { useAsyncAction } from "@/lib/use-async-action";

const MAX_DOMAINS = 50; // openapi EmbedPrivacy.allowed_domains maxItems.

const FIELD =
  "rounded-xl border border-border bg-surface px-3 py-1.5 text-sm text-fg placeholder:text-fg-muted focus-ring disabled:opacity-60";

/**
 * EmbedPrivacyManager is the studio's embed-privacy control (CORE-17), shown in
 * the video edit form. It reads the current policy and lets the owner pick a
 * tier — Enabled (anywhere) / Disabled (nowhere) / Only these domains (a
 * hostname allow-list) — then PUTs it. Domains are validated client-side to bare
 * hostnames (matching the server's rule) so a bad entry is caught before the PUT
 * (which would 400). Enforcement itself happens on the embed page, not here.
 */
export function EmbedPrivacyManager({ videoId }: { videoId: string }) {
  const [status, setStatus] = useState<EmbedPrivacyStatus>("enabled");
  const [domains, setDomains] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);

  const { run, busy, error, setError, clearError } = useAsyncAction(
    async (body: { status: EmbedPrivacyStatus; allowed_domains?: string[] }) => {
      const stored = await api.setVideoEmbedPrivacy(videoId, body);
      setStatus(stored.status);
      setDomains(stored.allowed_domains ?? []);
      setSaved(true);
    },
    "Could not save the embed settings.",
    (err) =>
      err instanceof ApiError && err.status === 400
        ? "Those embed settings weren't accepted — check the domains are bare hostnames."
        : null,
  );

  useEffect(() => {
    const controller = new AbortController();
    api
      .getVideoEmbedPrivacy(videoId, undefined, controller.signal)
      .then((policy) => {
        setStatus(policy.status);
        setDomains(policy.allowed_domains ?? []);
        setLoaded(true);
      })
      .catch(() => {
        // Default to the permissive tier if the read fails; still editable.
        if (!controller.signal.aborted) setLoaded(true);
      });
    return () => controller.abort();
  }, [videoId]);

  function addDomain() {
    const host = normalizeDomain(draft);
    if (host === null) {
      setError("Enter a bare hostname, e.g. example.com (no https://, port, or path).");
      return;
    }
    if (domains.includes(host)) {
      setDraft("");
      return;
    }
    if (domains.length >= MAX_DOMAINS) {
      setError(`At most ${MAX_DOMAINS} domains.`);
      return;
    }
    setDomains((prev) => [...prev, host]);
    setDraft("");
    clearError();
    setSaved(false);
  }

  function removeDomain(host: string) {
    setDomains((prev) => prev.filter((d) => d !== host));
    setSaved(false);
  }

  function save() {
    if (busy) return;
    // A whitelist with no domains would 400 — block it with a clear message.
    if (status === "whitelist" && domains.length === 0) {
      setError("Add at least one domain, or choose a different option.");
      return;
    }
    void run(status === "whitelist" ? { status, allowed_domains: domains } : { status });
  }

  if (!loaded) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-surface p-4">
        <p className="text-sm font-semibold">Embedding</p>
        <p className="mt-1 text-xs text-fg-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface p-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold">Embedding</p>
        <p className="text-xs text-fg-muted">
          Control where this video can be embedded with an iframe.
        </p>
      </div>

      <Select
        label="Where can this be embedded?"
        value={status}
        onChange={(e) => {
          setStatus(e.target.value as EmbedPrivacyStatus);
          setSaved(false);
          clearError();
        }}
      >
        <option value="enabled">Anywhere</option>
        <option value="disabled">Nowhere (embedding off)</option>
        <option value="whitelist">Only these domains</option>
      </Select>

      {status === "whitelist" ? (
        <div className="flex flex-col gap-2">
          {domains.length > 0 ? (
            <ul aria-label="Allowed domains" className="flex flex-wrap gap-1.5">
              {domains.map((host) => (
                <li key={host}>
                  <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2.5 py-1 text-xs text-fg">
                    <span className="tabular-nums">{host}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${host}`}
                      onClick={() => removeDomain(host)}
                      // 24×24 hit area (WCAG 2.5.8); -m-1 keeps the chip's
                      // original 16px footprint (no layout shift).
                      className="-m-1 flex h-6 w-6 items-center justify-center rounded-full text-fg-muted hover:text-fg focus-ring"
                    >
                      <CloseIcon size={14} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-warning">Add at least one allowed domain.</p>
          )}
          <div className="flex items-center gap-2">
            <input
              aria-label="Add allowed domain"
              placeholder="example.com"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addDomain();
                }
              }}
              className={`flex-1 ${FIELD}`}
            />
            <Button type="button" variant="secondary" size="sm" onClick={addDomain}>
              Add domain
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={() => void save()} disabled={busy}>
          {busy ? "Saving…" : "Save embed settings"}
        </Button>
        {saved ? (
          <span role="status" className="text-xs text-success">
            Embed settings saved.
          </span>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
