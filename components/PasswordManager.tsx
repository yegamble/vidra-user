"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { TrashIcon } from "@/components/icons";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { VideoPassword } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

// Contract bounds (openapi SetVideoPasswordRequest): each password is 6–100 chars.
const MIN_LENGTH = 6;
const MAX_LENGTH = 100;

const FIELD =
  "rounded-xl border border-border bg-surface px-3 py-1.5 text-sm text-fg placeholder:text-fg-muted focus-ring disabled:opacity-60";

/**
 * PasswordManager is the studio's per-video password list (CORE-17), revealed in
 * the edit form when privacy is "Password-protected". It lists the existing
 * passwords by created date (the plaintext/hash are write-only — never returned),
 * adds one (POST, 6–100 chars), and deletes one (DELETE). Deleting the LAST
 * password of a privacy=password video is refused by the server with 409, which
 * is surfaced as a plain message rather than silently failing.
 *
 * It reports the live count up via `onCountChange` so the edit form can block a
 * privacy=password save while zero passwords exist (which the server would 400).
 */
export function PasswordManager({
  videoId,
  onCountChange,
}: {
  videoId: string;
  onCountChange?: (count: number) => void;
}) {
  const [passwords, setPasswords] = useState<VideoPassword[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Push the current count up whenever the set (or load state) changes; null
  // until the first fetch resolves so the parent can tell "unknown" from "zero".
  useEffect(() => {
    if (loaded) onCountChange?.(passwords.length);
  }, [passwords.length, loaded, onCountChange]);

  useEffect(() => {
    const controller = new AbortController();
    api
      .listVideoPasswords(videoId, controller.signal)
      .then((res) => {
        setPasswords(res.passwords);
        setLoaded(true);
      })
      .catch(() => {
        // Start from an empty, still-editable list rather than blocking the surface.
        if (!controller.signal.aborted) setLoaded(true);
      });
    return () => controller.abort();
  }, [videoId]);

  const tooShort = draft.length > 0 && draft.length < MIN_LENGTH;

  async function add() {
    const value = draft;
    if (busy || value.length < MIN_LENGTH || value.length > MAX_LENGTH) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.addVideoPassword(videoId, value);
      setPasswords((prev) => [...prev, created]);
      setDraft("");
    } catch (err) {
      setError(errorMessage(err, "Could not add that password."));
    } finally {
      setBusy(false);
    }
  }

  async function remove(passwordId: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteVideoPassword(videoId, passwordId);
      setPasswords((prev) => prev.filter((p) => p.id !== passwordId));
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(
          "This is the last password. Add another before removing it, or change the video's privacy.",
        );
      } else {
        setError(errorMessage(err, "Could not remove that password."));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface p-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold">Passwords</p>
        <p className="text-xs text-fg-muted">
          Anyone with any of these passwords can watch. Add at least one before saving. Passwords
          are stored hashed and never shown again.
        </p>
      </div>

      {passwords.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border-subtle">
          {passwords.map((p, i) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2">
              <span className="text-sm text-fg">
                Password {i + 1}
                <span className="ml-2 text-xs tabular-nums text-fg-muted">
                  added {formatDateTime(p.created_at)}
                </span>
              </span>
              <button
                type="button"
                aria-label={`Remove password ${i + 1}`}
                onClick={() => void remove(p.id)}
                disabled={busy}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-danger-surface hover:text-danger focus-ring disabled:opacity-60"
              >
                <TrashIcon size={16} />
              </button>
            </li>
          ))}
        </ul>
      ) : loaded ? (
        <p className="text-xs text-warning">No passwords yet — add one so viewers can unlock this video.</p>
      ) : null}

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <input
            type="password"
            autoComplete="off"
            aria-label="New password"
            placeholder="New password"
            value={draft}
            maxLength={MAX_LENGTH}
            onChange={(e) => setDraft(e.target.value)}
            aria-invalid={tooShort ? true : undefined}
            aria-describedby={tooShort ? "new-password-hint" : undefined}
            className={`flex-1 ${FIELD}`}
          />
          <Button
            type="button"
            size="sm"
            onClick={() => void add()}
            disabled={busy || draft.length < MIN_LENGTH || draft.length > MAX_LENGTH}
          >
            Add
          </Button>
        </div>
        {tooShort ? (
          <p id="new-password-hint" className="text-xs text-danger">
            Passwords must be at least {MIN_LENGTH} characters.
          </p>
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
