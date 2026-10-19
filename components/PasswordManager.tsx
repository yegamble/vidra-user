"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { useFormat, useT } from "@/components/I18nProvider";
import { TrashIcon } from "@/components/icons";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { VideoPassword } from "@/lib/api";
import { useApiResource } from "@/lib/use-api-resource";

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
  onCountChange?: (count: number | null) => void;
}) {
  // Discard pending mutations and drafts when switching videos, too.
  return <PasswordList key={videoId} videoId={videoId} onCountChange={onCountChange} />;
}

function PasswordList({ videoId, onCountChange }: {
  videoId: string;
  onCountChange?: (count: number | null) => void;
}) {
  const t = useT();
  const format = useFormat();
  const { status, data, retry, setData: setPasswords } = useApiResource<VideoPassword[]>(
    async (signal) => (await api.listVideoPasswords(videoId, signal)).passwords,
    [videoId],
  );
  const loaded = status === "ready";
  const passwords = data ?? [];
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Push the current count up whenever the set (or load state) changes; null
  // until the first fetch resolves so the parent can tell "unknown" from "zero".
  useEffect(() => {
    onCountChange?.(loaded ? passwords.length : null);
  }, [passwords.length, loaded, onCountChange]);

  const tooShort = draft.length > 0 && draft.length < MIN_LENGTH;

  async function add() {
    const value = draft;
    if (!loaded || busy || value.length < MIN_LENGTH || value.length > MAX_LENGTH) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.addVideoPassword(videoId, value);
      setPasswords((prev) => prev ? [...prev, created] : prev);
      setDraft("");
    } catch (err) {
      setError(errorMessage(err, t("studio.passwords.addError")));
    } finally {
      setBusy(false);
    }
  }

  async function remove(passwordId: string) {
    if (!loaded || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteVideoPassword(videoId, passwordId);
      setPasswords((prev) => prev?.filter((p) => p.id !== passwordId) ?? null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(
          t("studio.passwords.lastPassword"),
        );
      } else {
        setError(errorMessage(err, t("studio.passwords.removeError")));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface p-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold">{t("studio.passwords.title")}</p>
        <p className="text-xs text-fg-muted">
          {t("studio.passwords.description")}
        </p>
      </div>

      {status === "loading" ? <Spinner label={t("studio.passwords.loading")} /> : null}
      {status === "error" ? <ErrorState message={t("studio.passwords.loadError")} onRetry={retry} /> : null}

      {passwords.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border-subtle">
          {passwords.map((p, i) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2">
              <span className="text-sm text-fg">
                {t("studio.passwords.item", { number: i + 1 })}
                <span className="ml-2 text-xs tabular-nums text-fg-muted">
                  {t("studio.passwords.added", { date: format.formatDateTime(p.created_at) })}
                </span>
              </span>
              <button
                type="button"
                aria-label={t("studio.passwords.remove", { number: i + 1 })}
                onClick={() => void remove(p.id)}
                disabled={busy}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-danger-surface hover:text-danger focus-ring disabled:opacity-60"
              >
                <TrashIcon size={16} />
              </button>
            </li>
          ))}
        </ul>
      ) : loaded ? (
        <p className="text-xs text-warning">{t("studio.passwords.empty")}</p>
      ) : null}

      <div className="flex flex-col gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <input
            type="password"
            autoComplete="off"
            aria-label={t("studio.passwords.new")}
            placeholder={t("studio.passwords.new")}
            disabled={!loaded || busy}
            value={draft}
            maxLength={MAX_LENGTH}
            onChange={(e) => setDraft(e.target.value)}
            aria-invalid={tooShort ? true : undefined}
            aria-describedby={tooShort ? "new-password-hint" : undefined}
            className={`min-w-0 flex-1 ${FIELD}`}
          />
          <Button
            type="button"
            size="sm"
            onClick={() => void add()}
            disabled={!loaded || busy || draft.length < MIN_LENGTH || draft.length > MAX_LENGTH}
          >
            {t("studio.passwords.add")}
          </Button>
        </div>
        {tooShort ? (
          <p id="new-password-hint" className="text-xs text-danger">
            {t("studio.passwords.minLength", { min: MIN_LENGTH })}
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
