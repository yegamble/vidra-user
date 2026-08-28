"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { TrashIcon } from "@/components/icons";
import { Alert } from "@/components/ui/Alert";
import { ErrorState } from "@/components/ui/ErrorState";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { SearchHistoryEntry, UpdateProfileRequest } from "@/lib/api";
import { FULL_LIST_LIMIT } from "@/lib/api/pagination";
import { relativeTime } from "@/lib/format";
import { SignInGate } from "@/components/SignInGate";

// A single per-key preference key on the profile update path. All three ride the
// existing PATCH /auth/me contract (regenerated UpdateProfileRequest).
type PrefKey =
  | "search_history_enabled"
  | "personalized_search_enabled"
  | "personalized_recommendations_enabled";

type SaveState = "idle" | "saving" | "saved" | "error";

// SearchSettingsView is the "Search & recommendations" account page
// (search-service W4): the three per-user personalization/history toggles (PATCH
// /auth/me) and the caller's stored search history (view + per-item delete +
// clear-all with a confirm modal). It mirrors the ProfileForm / PlayerSettingsView
// pattern — a settled signed-out session gets the sign-in prompt; a hard reload
// shows a loading state until the refresh cookie restores the session.
export function SearchSettingsView() {
  const { status, user } = useSession();

  if (status === "anon" || !user) {
    return (
      <SignInGate
        title="Sign in to manage your search settings"
        lead="Your session has ended."
        restoringLabel="Loading your settings"
      >
        to change your search and recommendation preferences.
      </SignInGate>
    );
  }

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <PreferencesSection
        key={user.id}
        initial={{
          search_history_enabled: user.search_history_enabled ?? true,
          personalized_search_enabled: user.personalized_search_enabled ?? true,
          personalized_recommendations_enabled: user.personalized_recommendations_enabled ?? true,
        }}
      />
      <SearchHistorySection />
    </div>
  );
}

// The three preference toggles. Each auto-saves the single changed field on
// toggle (PATCH /auth/me) and reflects a shared, polite saved-status line; a
// failed save reverts the toggle and reports the error.
function PreferencesSection({ initial }: { initial: Record<PrefKey, boolean> }) {
  const { updateProfile } = useSession();
  const [prefs, setPrefs] = useState<Record<PrefKey, boolean>>(initial);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  async function toggle(key: PrefKey, value: boolean) {
    setPrefs((p) => ({ ...p, [key]: value }));
    setSaveState("saving");
    setError(null);
    try {
      const patch: UpdateProfileRequest = { [key]: value };
      await updateProfile(patch);
      setSaveState("saved");
    } catch (err) {
      // Revert the optimistic flip and surface the failure.
      setPrefs((p) => ({ ...p, [key]: !value }));
      setSaveState("error");
      setError(errorMessage(err, "Could not save that change."));
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold tracking-tight text-fg">Personalization</h2>
        <p className="text-[13px] text-fg-muted">
          Vidra can use your searches and what you watch to tailor suggestions,
          search results, and your home recommendations. These controls are yours —
          turn any of them off at any time.
        </p>
      </div>

      {/* Polite, non-focus-stealing save status (design-system role=status line). */}
      <div role="status" aria-live="polite" className="min-h-5 text-[13px]">
        {saveState === "saving" ? <span className="text-fg-muted">Saving…</span> : null}
        {saveState === "saved" ? <span className="text-success">Saved.</span> : null}
        {saveState === "error" && error ? <span className="text-danger">{error}</span> : null}
      </div>

      <ToggleRow
        id="pref-search-history"
        label="Keep my search history"
        help="Save the searches you make so you can revisit them and get more relevant suggestions. While off, new searches are not stored to your history. Clear existing history below."
        checked={prefs.search_history_enabled}
        onChange={(v) => void toggle("search_history_enabled", v)}
      />
      <ToggleRow
        id="pref-personalized-search"
        label="Personalize my search results"
        help="Rank search results using what you've watched and searched before. While off, everyone sees the same results for a query."
        checked={prefs.personalized_search_enabled}
        onChange={(v) => void toggle("personalized_search_enabled", v)}
      />
      <ToggleRow
        id="pref-personalized-recommendations"
        label="Personalize my recommendations"
        help="Tailor your home 'For you' rail and related videos to your activity. While off, you'll see trending and related videos that aren't personalized."
        checked={prefs.personalized_recommendations_enabled}
        onChange={(v) => void toggle("personalized_recommendations_enabled", v)}
      />

      <p className="text-xs text-fg-muted">
        Retention: your search activity is kept only as long as the administrator
        of this instance configures, and is removed on request. Clearing your
        history below deletes your stored searches immediately.
      </p>
    </section>
  );
}

function ToggleRow({
  id,
  label,
  help,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  help: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-2">
      <input
        id={id}
        name={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={`${id}-help`}
        className="focus-ring mt-0.5 h-4 w-4 rounded border-border accent-accent"
      />
      <div className="flex flex-col">
        <label htmlFor={id} className="text-sm font-medium text-fg">
          {label}
        </label>
        <span id={`${id}-help`} className="text-xs text-fg-muted">
          {help}
        </span>
      </div>
    </div>
  );
}

type HistoryStatus = "loading" | "ready" | "unavailable" | "error";

// The stored search-history list: view, per-item delete, and clear-all behind a
// confirm modal. A 503 search_unavailable (the honest answer when the search
// service is down) shows a temporary-unavailable state — never a fake empty
// history.
function SearchHistorySection() {
  const [entries, setEntries] = useState<SearchHistoryEntry[]>([]);
  const [status, setStatus] = useState<HistoryStatus>("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getSearchHistory({ limit: FULL_LIST_LIMIT }, controller.signal)
      .then((res) => {
        setEntries(res.entries ?? []);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        // A disabled/unreachable search service answers 503 search_unavailable.
        if (err instanceof ApiError && err.status === 503) {
          setStatus("unavailable");
        } else {
          setStatus("error");
        }
      });
    return () => controller.abort();
  }, [reloadKey]);

  function retry() {
    setStatus("loading");
    setReloadKey((k) => k + 1);
  }

  async function removeOne(entry: SearchHistoryEntry) {
    const key = entry.normalized_query ?? entry.query;
    if (!key) return;
    setActionError(null);
    // Optimistic removal.
    setEntries((prev) => prev.filter((e) => e !== entry));
    try {
      await api.deleteSearchHistoryEntry(key);
    } catch (err) {
      // Restore on failure and report.
      setEntries((prev) => [...prev, entry]);
      setActionError(
        err instanceof ApiError && err.status === 503
          ? "Search history is temporarily unavailable."
          : errorMessage(err, "Could not remove that search."),
      );
    }
  }

  async function clearAll() {
    setClearing(true);
    setActionError(null);
    try {
      await api.clearSearchHistory();
      setEntries([]);
      setConfirmClear(false);
    } catch (err) {
      setActionError(
        err instanceof ApiError && err.status === 503
          ? "Search history is temporarily unavailable."
          : errorMessage(err, "Could not clear your history."),
      );
    } finally {
      setClearing(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight text-fg">Search history</h2>
        {status === "ready" && entries.length > 0 ? (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            className="focus-ring rounded-full border border-border px-3.5 py-1.5 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-muted"
          >
            Clear all
          </button>
        ) : null}
      </div>

      {actionError ? (
        <Alert>
          {actionError}
        </Alert>
      ) : null}

      {status === "loading" ? (
        <div className="flex justify-center py-8">
          <Spinner label="Loading your search history" />
        </div>
      ) : null}

      {status === "unavailable" ? (
        <ErrorState
          title="Search history is temporarily unavailable"
          message="The search service is offline right now. Try again in a little while."
          onRetry={retry}
        />
      ) : null}

      {status === "error" ? (
        <ErrorState
          message="Could not load your search history."
          onRetry={retry}
        />
      ) : null}

      {status === "ready" && entries.length === 0 ? (
        <p className="text-sm text-fg-muted">You have no saved searches.</p>
      ) : null}

      {status === "ready" && entries.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border-subtle rounded-2xl bg-surface-muted">
          {entries.map((entry, index) => {
            const text = entry.query ?? entry.normalized_query ?? "";
            const when = entry.last_used_at ? relativeTime(entry.last_used_at) : "";
            return (
              <li
                key={`${entry.normalized_query ?? entry.query ?? index}-${index}`}
                className="flex items-center gap-3 px-4 py-3"
              >
                <span className="min-w-0 flex-1">
                  <Link
                    href={`/search?q=${encodeURIComponent(text)}`}
                    className="focus-ring block truncate rounded text-sm font-medium text-fg hover:underline"
                  >
                    {text}
                  </Link>
                  {when ? <span className="mt-0.5 block text-xs text-fg-muted">{when}</span> : null}
                </span>
                <button
                  type="button"
                  onClick={() => void removeOne(entry)}
                  aria-label={`Remove “${text}” from your search history`}
                  className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-strong hover:text-fg"
                >
                  <TrashIcon size={16} strokeWidth={2} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {confirmClear ? (
        <Modal title="Clear your search history?" onClose={() => setConfirmClear(false)}>
          <p className="text-sm text-fg-muted">
            This permanently removes every search you have made on this instance.
            This cannot be undone.
          </p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={clearing}
              onClick={() => setConfirmClear(false)}
              className="focus-ring rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-fg transition-colors hover:bg-surface-muted disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={clearing}
              onClick={() => void clearAll()}
              className="focus-ring rounded-full bg-danger-solid px-4 py-2 text-sm font-semibold text-danger-fg transition-colors hover:bg-danger-solid/90 disabled:opacity-60"
            >
              {clearing ? "Clearing…" : "Clear history"}
            </button>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
