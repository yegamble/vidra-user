"use client";

import { useEffect, useState } from "react";

import { Spinner } from "@/components/ui/Spinner";
import { api, errorMessage } from "@/lib/api";

// ReadReceiptsToggle is the /settings opt-out for DM read receipts
// (GET/PATCH /api/v1/me/messaging-prefs). Core defaults `read_receipts` to
// ENABLED and only hides the caller's read watermark from peers once it is
// turned off — so without this control every account broadcasts exactly when it
// read each message, to a peer whose thread renders that as "Seen"
// (MessageBubble). The flip is optimistic and REVERTS on failure: a switch that
// looked off while the watermark kept flowing would be worse than none.
export function ReadReceiptsToggle() {
  const [checked, setChecked] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getMessagingPrefs(controller.signal)
      .then((prefs) => setChecked(prefs.read_receipts))
      .catch(() => {
        // Never silently disappear: an unreachable preference still leaves the
        // watermark flowing, so say so and offer the retry.
        if (!controller.signal.aborted) setLoadError(true);
      });
    return () => controller.abort();
  }, [reloadKey]);

  async function onToggle(next: boolean) {
    const previous = checked;
    setChecked(next);
    setError(null);
    setSaved(false);
    try {
      const prefs = await api.updateMessagingPrefs({ read_receipts: next });
      setChecked(prefs.read_receipts);
      setSaved(true);
    } catch (err) {
      setChecked(previous); // revert the optimistic flip
      setError(errorMessage(err));
    }
  }

  return (
    <section className="flex max-w-xl flex-col gap-3 rounded-2xl border border-border-subtle bg-surface p-4">
      {loadError ? (
        <div className="flex flex-wrap items-center gap-3">
          <p role="alert" className="text-sm text-fg-muted">
            Could not load your read-receipt setting.
          </p>
          <button
            type="button"
            onClick={() => {
              setLoadError(false);
              setReloadKey((k) => k + 1);
            }}
            className="focus-ring rounded-full border border-border bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-muted"
          >
            Retry
          </button>
        </div>
      ) : checked === null ? (
        <div className="flex justify-center py-1">
          <Spinner label="Loading your read-receipt setting" />
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <input
            id="settings-read-receipts"
            name="settings-read-receipts"
            type="checkbox"
            checked={checked}
            onChange={(e) => void onToggle(e.target.checked)}
            aria-describedby="settings-read-receipts-help"
            className="focus-ring mt-0.5 h-4 w-4 rounded border-border accent-accent"
          />
          <div className="flex min-w-0 flex-col">
            <label htmlFor="settings-read-receipts" className="text-sm font-medium text-fg">
              Show others when I&rsquo;ve read their messages
            </label>
            <span id="settings-read-receipts-help" className="text-xs text-fg-muted">
              While on, the person you are messaging sees a &ldquo;Seen&rdquo; marker once you open
              their message. Turning it off hides only your own read times &mdash; you still see
              theirs when they leave this on.
            </span>
            {saved ? (
              <span role="status" className="mt-1 text-xs text-success">
                Saved.
              </span>
            ) : null}
            {error ? (
              <span role="alert" className="mt-1 text-xs text-danger">
                {error}
              </span>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
