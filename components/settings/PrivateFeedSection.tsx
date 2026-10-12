"use client";

import { useCallback, useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { CopyIcon, RotateCwIcon } from "@/components/icons";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { api, errorMessage } from "@/lib/api";
import type { FeedTokenStatus } from "@/lib/api";

// The private subscriptions feed: a secret URL a feed reader can poll without a
// bearer header (GET /feeds/subscriptions.xml?token=…). The backend stores only
// a hash, so the URL is visible exactly once — right after "Generate" or
// "Rotate" — and the section says so rather than pretending it can show it again.
export function PrivateFeedSection() {
  const { status } = useSession();
  const [token, setToken] = useState<FeedTokenStatus | null>(null);
  const [issuedUrl, setIssuedUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (status !== "authed") return;
    let live = true;
    api
      .getFeedToken()
      .then((t) => live && setToken(t))
      .catch((e) => live && setError(errorMessage(e, "Couldn't load your private feed.")));
    return () => {
      live = false;
    };
  }, [status]);

  const rotate = useCallback(async () => {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const issued = await api.rotateFeedToken();
      setIssuedUrl(issued.url ?? null);
      setToken({ configured: true, created_at: issued.created_at });
    } catch (e) {
      setError(errorMessage(e, "Couldn't generate a private feed URL."));
    } finally {
      setBusy(false);
    }
  }, []);

  const revoke = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await api.revokeFeedToken();
      setIssuedUrl(null);
      setToken({ configured: false });
    } catch (e) {
      setError(errorMessage(e, "Couldn't turn off your private feed."));
    } finally {
      setBusy(false);
    }
  }, []);

  const copy = useCallback(async () => {
    if (!issuedUrl) return;
    try {
      await navigator.clipboard.writeText(issuedUrl);
      setCopied(true);
    } catch {
      // Clipboard can be unavailable; the field stays selectable.
      setCopied(false);
    }
  }, [issuedUrl]);

  if (status !== "authed") return null;

  const configured = token?.configured === true;
  return (
    <section
      aria-label="Private feed"
      className="mt-6 max-w-xl rounded-2xl border border-border-subtle bg-surface p-4"
    >
      <h2 className="text-headline">Private feed URL</h2>
      <p className="mt-1 text-subhead text-fg-muted">
        Follow your subscriptions in any RSS reader. Anyone with this URL can read the feed, so
        keep it private — rotate it if it leaks.
      </p>
      {error ? (
        <Alert variant="danger" className="mt-3">
          {error}
        </Alert>
      ) : null}
      {issuedUrl ? (
        <div className="mt-3 flex items-center gap-2">
          <input
            readOnly
            aria-label="Private feed URL"
            value={issuedUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-canvas px-3 py-2 text-subhead"
          />
          <Button type="button" variant="secondary" size="sm" onClick={copy}>
            <CopyIcon size={16} /> {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      ) : null}
      {issuedUrl ? (
        <p className="mt-2 text-footnote text-fg-muted">
          This is the only time the URL is shown. Copy it now.
        </p>
      ) : configured ? (
        <p className="mt-3 text-subhead text-fg-muted">
          A private feed is on. Its URL can&rsquo;t be shown again; rotate to get a new one.
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={rotate}>
          <RotateCwIcon size={16} /> {configured ? "Rotate URL" : "Generate URL"}
        </Button>
        {configured ? (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={revoke}>
            Turn off
          </Button>
        ) : null}
      </div>
    </section>
  );
}
