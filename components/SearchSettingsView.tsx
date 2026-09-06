"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { SearchIcon, TrashIcon } from "@/components/icons";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { SearchHistoryEntry, UpdateProfileRequest } from "@/lib/api";
import { FULL_LIST_LIMIT } from "@/lib/api/pagination";
import { relativeTime } from "@/lib/format";
import type { InstanceSearchBlock } from "@/lib/instance-config.server";
import { SEARCH_RETRY_QUALIFIER, SEARCH_SERVICE_DOWN } from "@/lib/search-failure";
import { SignInGate } from "@/components/SignInGate";

// A single per-key preference key on the profile update path. All three ride the
// existing PATCH /auth/me contract (regenerated UpdateProfileRequest).
type PrefKey =
  | "search_history_enabled"
  | "personalized_search_enabled"
  | "personalized_recommendations_enabled";

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * One toggle's INSTANCE-level verdict. Every preference on this page is only
 * half of a two-factor gate: vidra-core ANDs the user row with an operator
 * setting before anything happens
 * (`internal/httpapi/search.go` — `searchAdvanced() && instancePersonalizedSearch()
 * && prefs.Personalized`, `instancePersonalizedRecs() && prefs.PersonalizedRecs`,
 * `instanceSearchHistoryEnabled() && prefs.History`). The operator half is
 * published on `GET /instance` in the `search{}` block, so the page can say so
 * instead of accepting a tick, answering "Saved." in green, and changing
 * nothing for ever.
 */
type Gate = { allowed: true } | { allowed: false; reason: string };

const GATE_OPEN: Gate = { allowed: true };

/** The one-line reason for an operator switching a whole feature off. */
const ADMIN_OFF = "Turned off for everyone on this site by the administrator.";

/**
 * The instance half of each gate. `undefined` means "not gated": an older
 * backend, a failed /instance fetch, or the mocked e2e suite must never make a
 * working control look forbidden, which is the same `!== false` reading every
 * other consumer of this block uses (SearchResults, Header).
 */
function instanceGates(search: InstanceSearchBlock | undefined): Record<PrefKey, Gate> {
  // BOTH personalization controls are mode-gated server-side, and for the same
  // reason: simple mode never applies behavioural signals, whatever the toggles
  // say. Core computes the search flag as `searchAdvanced() &&
  // instancePersonalizedSearch() && ...` and the rails' flag as `searchAdvanced()
  // && instancePersonalizedRecs() && ...` (core#168 added the second half). The
  // recommendations toggle carried no such gate here, so on the shipped `simple`
  // default it accepted a click, said "Saved." in green, and changed nothing —
  // the exact failure the search toggle's gate exists to prevent.
  const simpleMode = search?.mode === "simple";
  const modeOff = (what: string): Gate => ({
    allowed: false,
    reason: `This site ranks search with simple heuristics, so personalized ${what} are not available.`,
  });
  return {
    search_history_enabled:
      search?.search_history_enabled === false
        ? { allowed: false, reason: ADMIN_OFF }
        : // Deliberately NOT mode-gated: history stores rows, it does not rank
          // them, and it works identically in both modes.
          GATE_OPEN,
    personalized_search_enabled:
      search?.personalized_search_enabled === false
        ? { allowed: false, reason: ADMIN_OFF }
        : simpleMode
          ? modeOff("results")
          : GATE_OPEN,
    personalized_recommendations_enabled:
      search?.personalized_recommendations_enabled === false
        ? { allowed: false, reason: ADMIN_OFF }
        : simpleMode
          ? modeOff("recommendations")
          : GATE_OPEN,
  };
}

// SearchSettingsView is the "Search & recommendations" account page
// (search-service W4): the three per-user personalization/history toggles (PATCH
// /auth/me) and the caller's stored search history (view + per-item delete +
// clear-all with a confirm modal). It mirrors the ProfileForm / PlayerSettingsView
// pattern — a settled signed-out session gets the sign-in prompt; a hard reload
// shows a loading state until the refresh cookie restores the session.
export function SearchSettingsView({
  instanceSearch,
}: {
  /** The `search{}` block of GET /instance, threaded down by the server page. */
  instanceSearch?: InstanceSearchBlock;
}) {
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

  const gates = instanceGates(instanceSearch);

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <PreferencesSection
        key={user.id}
        gates={gates}
        initial={{
          search_history_enabled: user.search_history_enabled ?? true,
          personalized_search_enabled: user.personalized_search_enabled ?? true,
          personalized_recommendations_enabled: user.personalized_recommendations_enabled ?? true,
        }}
      />
      <SearchHistorySection instanceEnabled={gates.search_history_enabled.allowed} />
    </div>
  );
}

// The three preference toggles. Each auto-saves the single changed field on
// toggle (PATCH /auth/me) and reflects a shared, polite saved-status line; a
// failed save reverts the toggle and reports the error.
function PreferencesSection({
  initial,
  gates,
}: {
  initial: Record<PrefKey, boolean>;
  gates: Record<PrefKey, Gate>;
}) {
  const { updateProfile } = useSession();
  const [prefs, setPrefs] = useState<Record<PrefKey, boolean>>(initial);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  async function toggle(key: PrefKey, value: boolean) {
    // Belt and braces beside the disabled input: a gated preference must never
    // reach PATCH /auth/me, because the server would accept it and the page
    // would then report "Saved." for a change with no effect.
    if (!gates[key].allowed) return;
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
          turn any of them off at any time, and each one feeds only its own
          feature. Once none of them is active for you, your searches and plays
          stop being recorded against your account altogether: from that moment
          they are stored the way a signed-out visitor&rsquo;s are, counted once
          toward the anonymous totals this site uses to decide what is popular,
          and never linked back to you. A control this site has switched off
          collects nothing either — it is greyed out below with the reason.
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
        gate={gates.search_history_enabled}
      />
      <ToggleRow
        id="pref-personalized-search"
        label="Personalize my search results"
        help="Rank search results using what you've watched and searched before. While off, everyone sees the same results for a query."
        checked={prefs.personalized_search_enabled}
        onChange={(v) => void toggle("personalized_search_enabled", v)}
        gate={gates.personalized_search_enabled}
      />
      <ToggleRow
        id="pref-personalized-recommendations"
        label="Personalize my recommendations"
        help="Tailor your home 'For you' rail and related videos to your activity. While off, you'll see trending and related videos that aren't personalized."
        checked={prefs.personalized_recommendations_enabled}
        onChange={(v) => void toggle("personalized_recommendations_enabled", v)}
        gate={gates.personalized_recommendations_enabled}
      />

      <p className="text-xs text-fg-muted">
        Retention: your search activity is kept only as long as the administrator
        of this instance configures — 90 days unless they change it — and is
        removed on request. Turning a control off works from that moment onward:
        activity recorded before you turned it off keeps the link to your account
        until it ages out. To remove it now, use Clear all below: it deletes
        your stored searches and the search service&apos;s raw records of them
        outright — not just your name from them. The anonymous popularity totals
        this site keeps are recomputed without you within a day, except the
        trending counters, which cannot be edited and instead expire within 8
        days.
      </p>
    </section>
  );
}

// One preference row. A row the operator has switched off site-wide renders
// DISABLED with a visible one-line reason, while still showing the caller's own
// stored value — both facts matter, and hiding either is what made this page
// lie. The reason joins the accessible description so it is not colour/position
// coded only.
function ToggleRow({
  id,
  label,
  help,
  checked,
  onChange,
  gate,
}: {
  id: string;
  label: string;
  help: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  gate: Gate;
}) {
  const reason = gate.allowed ? null : gate.reason;
  return (
    <div className="flex items-start gap-2">
      <input
        id={id}
        name={id}
        type="checkbox"
        checked={checked}
        disabled={reason !== null}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={reason !== null ? `${id}-help ${id}-gate` : `${id}-help`}
        className="focus-ring mt-0.5 h-4 w-4 rounded border-border accent-accent disabled:opacity-50"
      />
      <div className="flex flex-col">
        <label
          htmlFor={id}
          className={`text-sm font-medium ${reason !== null ? "text-fg-muted" : "text-fg"}`}
        >
          {label}
        </label>
        <span id={`${id}-help`} className="text-xs text-fg-muted">
          {help}
        </span>
        {reason !== null ? (
          <span id={`${id}-gate`} className="mt-1 text-xs font-medium text-warning">
            {reason}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// "off" is the operator having switched search history off site-wide: a
// deliberate configuration, not a failure, and the one state where no request
// is made at all.
type HistoryStatus = "loading" | "ready" | "off" | "error";

type LoadFailure = {
  /** Undefined falls through to ErrorState's own "Something went wrong". */
  title?: string;
  message: string;
  /** Whether a retry could EVER succeed. A button that cannot work is a lie. */
  retryable: boolean;
};

/**
 * The three failure states core's searchHistoryGate() distinguishes, kept apart
 * because they ask the reader for three different things. This mirrors
 * SuggestionBansView's treatment of the same two responses, deliberately:
 * one HTTP status should not get two different stories in one product.
 *
 *  - 503 `search_unavailable` — the search service is down OR was never wired.
 *    An instance that simply never runs vidra-search is supported, so this is
 *    frequently PERMANENT. A retry is offered but explicitly qualified. (This
 *    page previously said "temporarily unavailable … try again in a little
 *    while" over exactly this response.)
 *  - 403 `feature_disabled` — the admin turned smart search off. Only an admin
 *    undoes it, so no retry.
 *  - 403/401 otherwise — the caller may not read this history. Retrying cannot
 *    help either.
 */
function describeHistoryFailure(err: unknown): LoadFailure {
  if (err instanceof ApiError) {
    if (err.status === 503 || err.code === "search_unavailable") {
      return {
        title: "The search service did not answer",
        message: `Your search history is stored by the search service. ${SEARCH_SERVICE_DOWN} ${SEARCH_RETRY_QUALIFIER}`,
        retryable: true,
      };
    }
    if (err.status === 403 && err.code === "feature_disabled") {
      return {
        title: "Smart search is switched off",
        message:
          "This instance is not running smart search, so it is not keeping a search history for you. An administrator can turn it on in the instance settings.",
        retryable: false,
      };
    }
    if (err.status === 403 || err.status === 401) {
      return {
        title: "You cannot see this search history",
        message:
          "Your account does not have permission to read or change these stored searches. Sign in again if your session has changed.",
        retryable: false,
      };
    }
  }
  return { message: "Could not load your search history.", retryable: true };
}

/** The same three states for a delete/clear that did NOT take effect. */
function historyMutationError(notDone: string, err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 503 || err.code === "search_unavailable") {
      return `${notDone}. ${SEARCH_SERVICE_DOWN}`;
    }
    if (err.status === 403 && err.code === "feature_disabled") {
      return `${notDone}. Smart search is switched off on this instance.`;
    }
    if (err.status === 403) {
      return `${notDone}. Your account cannot change these stored searches.`;
    }
  }
  return errorMessage(err, `${notDone}.`);
}

// The stored search-history list: view, per-item delete, and clear-all behind a
// confirm modal. Never a fake empty history — a service that did not answer
// says so, and says whether waiting could possibly help.
//
// `instanceEnabled` false means the operator switched search history off for
// everyone. Nothing new is being recorded, so the list is not fetched at all;
// clear-all stays reachable because searches stored BEFORE the switch survive
// (core gates recording on the instance setting, but not the read/delete
// routes) and erasing them is the whole point of this section.
//
// Clear-all is offered on an EMPTY list too, for the same reason and a stronger
// one: this list is `user_search_history` alone, while the clear also DELETES
// the raw query_log and behavior_events rows the search service keeps (they used
// to be anonymised in place; vidra-search#37 made the clear a real delete) and
// erases core's own search_outbox copy of the query text — rows this list has
// never shown. An empty list therefore does not mean there is nothing to clear, and
// the users whose list is empty because they opted out are exactly the ones with
// the strongest claim on the control. It stays hidden while the list is loading
// or has failed, where a click would race an unknown state.
function SearchHistorySection({ instanceEnabled }: { instanceEnabled: boolean }) {
  const [entries, setEntries] = useState<SearchHistoryEntry[]>([]);
  const [fetchStatus, setFetchStatus] = useState<HistoryStatus>("loading");
  const [failure, setFailure] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    // The one state that issues no request at all. Core does NOT gate the read
    // route on the instance setting, so this endpoint would answer 200 with
    // whatever predates the switch — a list that can only mislead about what is
    // being recorded now.
    if (!instanceEnabled) return;
    const controller = new AbortController();
    api
      .getSearchHistory({ limit: FULL_LIST_LIMIT }, controller.signal)
      .then((res) => {
        setEntries(res.entries ?? []);
        setFetchStatus("ready");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setFailure(err);
        setFetchStatus("error");
      });
    return () => controller.abort();
  }, [reloadKey, instanceEnabled]);

  // "off" is derived, not stored: the operator's verdict outranks any fetch
  // state, and deriving it keeps the spinner from flashing before the effect.
  const status: HistoryStatus = instanceEnabled ? fetchStatus : "off";
  const problem = status === "error" ? describeHistoryFailure(failure) : null;

  function retry() {
    setFetchStatus("loading");
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
      setActionError(historyMutationError("That search was not removed", err));
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
      setActionError(historyMutationError("Your history was not cleared", err));
    } finally {
      setClearing(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight text-fg">Search history</h2>
        {status === "off" || status === "ready" ? (
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

      {status === "off" ? (
        <EmptyState
          icon={<SearchIcon size={24} />}
          tint="gray"
          title="This site does not record search history"
          message="The administrator turned search history off for everyone here, so your searches are no longer saved. Anything stored before that is not listed, but you can still erase it."
        />
      ) : null}

      {problem ? (
        <ErrorState
          title={problem.title}
          message={problem.message}
          onRetry={problem.retryable ? retry : undefined}
        />
      ) : null}

      {status === "ready" && entries.length === 0 ? (
        <p className="text-sm text-fg-muted">
          You have no saved searches. Clear all still erases any earlier activity
          this site holds under your account.
        </p>
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
