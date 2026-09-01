"use client";

import { useState } from "react";

import { RoleGate } from "@/components/RoleGate";
import { SearchIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ListTail } from "@/components/ui/ListTail";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api } from "@/lib/api";
import type { SuggestionBanEntry } from "@/lib/api";
import { formatCount, pluralize, relativeTime } from "@/lib/format";
import { SEARCH_RETRY_QUALIFIER, SEARCH_SERVICE_DOWN } from "@/lib/search-failure";
import { useAppendingList } from "@/lib/use-appending-list";
import { useAsyncAction } from "@/lib/use-async-action";

const MAX_QUERY_LEN = 200;

/**
 * SuggestionBansView — the moderator surface for instance-wide autosuggest
 * bans: the banned queries, the evidence each ban rests on, an unban per row,
 * and a field to ban a new query. Before it, lifting a ban meant raw SQL.
 *
 * It lives under /moderation, not /admin/config: core gates these three routes
 * `requireRole(RoleAdmin, RoleModerator)` on purpose, while the
 * instance-settings endpoints are admin-only — a config-page home would have
 * locked out exactly the moderator the contract was widened for.
 *
 * NO COUNT IS RENDERED ANYWHERE. `SuggestionBanListResponse` is `entries` +
 * `limit` + `offset` with no `total`, so "N banned queries" would be invented.
 * Hence the appending "Load more" idiom (`useAppendingList` + `ListTail`) — the
 * repo's pattern for "more may exist, count unknown" — rather than
 * `PagedListShell`, whose count line has nothing honest to say here.
 */
export function SuggestionBansView() {
  return (
    <RoleGate minRole="moderator" action="manage autosuggest bans">
      <BansList />
    </RoleGate>
  );
}

type LoadFailure = {
  /** Undefined falls through to ErrorState's own "Something went wrong". */
  title?: string;
  message: string;
  /** Whether a retry could ever succeed. A button that cannot work is a lie. */
  retryable: boolean;
};

/**
 * The three failure states the contract distinguishes, kept apart because they
 * ask the reader for three different things:
 *
 *  - 503 `search_unavailable` — search is down OR was never configured. A retry
 *    is offered, but the copy does not promise it will work: "not configured"
 *    never resolves on its own. (A neighbouring surface shipped "temporarily
 *    unavailable — try again in a little while" over exactly this response.)
 *  - 403 `feature_disabled` — smart search is off. Only an admin fixes it, so
 *    no retry.
 *  - 403 otherwise — the caller is not a moderator. Retrying cannot help.
 */
function describeSuggestionBanFailure(err: unknown): LoadFailure {
  if (err instanceof ApiError) {
    if (err.status === 503 || err.code === "search_unavailable") {
      return {
        title: "The search service did not answer",
        message: `Autosuggest bans are stored by the search service. ${SEARCH_SERVICE_DOWN} ${SEARCH_RETRY_QUALIFIER}`,
        retryable: true,
      };
    }
    if (err.status === 403 && err.code === "feature_disabled") {
      return {
        title: "Smart search is switched off",
        message:
          "This instance is not running smart search, so there is no instance-wide autosuggest to ban queries from. An administrator can turn it on in the instance settings.",
        retryable: false,
      };
    }
    if (err.status === 403 || err.status === 401) {
      return {
        title: "You cannot manage autosuggest bans",
        message:
          "Your account does not have permission to view or change the autosuggest ban list. Ask an administrator for the moderator role.",
        retryable: false,
      };
    }
  }
  return { message: "Could not load the autosuggest ban list.", retryable: true };
}

/**
 * Mutation copy for the same states. `notDone` says plainly that the change did
 * NOT take effect: the contract never reports a 503 ban as a success, and a
 * moderator who believes a slur is suppressed when it is not is worse off than
 * one who knows it failed.
 */
function mapMutationError(notDone: string) {
  return (err: unknown): string | null => {
    if (err instanceof ApiError) {
      if (err.status === 503 || err.code === "search_unavailable") {
        return `${notDone}. ${SEARCH_SERVICE_DOWN}`;
      }
      if (err.status === 403 && err.code === "feature_disabled") {
        return `${notDone}. Smart search is switched off on this instance.`;
      }
      if (err.status === 403) {
        return `${notDone}. Your account cannot change autosuggest bans.`;
      }
      if (err.status === 422) {
        return `${notDone}. That query is blank once normalized.`;
      }
    }
    return null;
  };
}

function BansList() {
  // useAppendingList reports only THAT the load failed; the three states above
  // need the error itself, so the load callback keeps it.
  const [failure, setFailure] = useState<unknown>(null);

  const list = useAppendingList<SuggestionBanEntry>({
    queryKey: "suggestion-bans",
    load: async (window, signal) => {
      try {
        const res = await api.listSuggestionBans(
          { limit: window.limit, offset: window.offset },
          signal,
        );
        setFailure(null);
        // No `total` passed on: the envelope has none, and AppendingPage
        // reads undefined as UNKNOWN rather than zero.
        return { items: res.entries };
      } catch (err) {
        if (!signal.aborted) setFailure(err);
        throw err;
      }
    },
  });

  const problem = list.status === "error" ? describeSuggestionBanFailure(failure) : null;

  return (
    <div className="flex flex-col gap-5">
      <BanForm onBanned={list.reload} />

      {list.status === "loading" ? (
        <div className="flex justify-center py-24">
          <Spinner label="Loading banned queries" />
        </div>
      ) : null}

      {problem ? (
        <ErrorState
          title={problem.title}
          message={problem.message}
          onRetry={problem.retryable ? list.reload : undefined}
        />
      ) : null}

      {list.status === "ready" ? (
        list.items.length === 0 ? (
          <EmptyState
            icon={<SearchIcon size={24} />}
            title="No queries are banned"
            message="Autosuggest is showing every query that has cleared the aggregation threshold. Ban one above to suppress it instance-wide."
          />
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {list.items.map((entry) => (
                <li key={entry.normalized_query}>
                  <BanRow
                    entry={entry}
                    onLifted={(key) => list.drop((e) => e.normalized_query !== key)}
                  />
                </li>
              ))}
            </ul>
            {/* autoLoad off: a moderation list pages on an explicit, keyboard-
                reachable button, never on scroll. */}
            <ListTail
              hasMore={list.hasMore}
              autoLoad={false}
              busy={list.moreStatus === "loading"}
              error={list.moreStatus === "error" ? "Could not load more banned queries." : null}
              onLoadMore={list.loadMore}
            />
          </>
        )
      ) : null}
    </div>
  );
}

// The ban field. The SEARCH SERVICE decides the aggregate key, so the
// confirmation quotes the response's `normalized_query` — the value a later
// unban must target — never the string that was typed.
function BanForm({ onBanned }: { onBanned: () => void }) {
  const [value, setValue] = useState("");
  const [banned, setBanned] = useState<string | null>(null);

  const { run, busy, error, clearError } = useAsyncAction(
    async (query: string) => {
      const res = await api.banSuggestion(query);
      setBanned(res.normalized_query);
      setValue("");
      // The response carries no aggregate evidence (counts, first/last seen),
      // so the row cannot be faked — refetch instead of prepending a stub.
      onBanned();
    },
    "Could not ban that query.",
    mapMutationError("The ban was not applied"),
  );

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const query = value.trim();
        if (query === "" || busy) return;
        setBanned(null);
        void run(query);
      }}
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          aria-label="Ban a query from autosuggest"
          placeholder="Query to suppress from autosuggest"
          maxLength={MAX_QUERY_LEN}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            clearError();
          }}
          className="focus-ring min-h-11 w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg placeholder:text-fg-muted sm:max-w-sm"
        />
        <Button type="submit" disabled={busy || value.trim() === ""} className="shrink-0">
          {busy ? "Banning…" : "Ban query"}
        </Button>
      </div>
      <div role="status" aria-live="polite" className="min-h-5">
        {banned ? (
          <p className="text-[13px] text-fg-muted">
            “{banned}” is banned. Autosuggest normalized what you typed, and that is the key
            an unban has to match.
          </p>
        ) : null}
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </form>
  );
}

// One banned query: display form, the aggregate key an unban targets, and the
// counts a second moderator judges someone else's ban on. Unban is a two-step
// confirm (the ModerationQueue delete idiom) so no stray tap on a phone can
// quietly restore an abusive string.
function BanRow({
  entry,
  onLifted,
}: {
  entry: SuggestionBanEntry;
  onLifted: (normalizedQuery: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const { run, busy, error } = useAsyncAction(
    async () => {
      await api.unbanSuggestion(entry.normalized_query);
      onLifted(entry.normalized_query);
    },
    "Could not lift this ban.",
    mapMutationError("The ban was not lifted"),
  );

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-semibold text-fg">{entry.query}</p>
        {entry.normalized_query !== entry.query ? (
          <p className="mt-0.5 break-words text-[13px] text-fg-muted">
            key{" "}
            <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[12px] text-fg">
              {entry.normalized_query}
            </code>
          </p>
        ) : null}
        <p className="mt-1 text-[13px] text-fg-muted">
          <span>
            {formatCount(entry.total_count)} {pluralize(entry.total_count, "search", "searches")}
          </span>
          {" · "}
          <span>
            {formatCount(entry.distinct_users)}{" "}
            {pluralize(entry.distinct_users, "person", "people")}
          </span>
          {" · "}
          <span>first seen {relativeTime(entry.first_seen)}</span>
          {" · "}
          <span>last seen {relativeTime(entry.last_seen)}</span>
        </p>
        {error ? <p className="mt-1 text-[13px] text-danger">{error}</p> : null}
      </div>

      {confirming ? (
        <div className="flex flex-wrap items-center gap-3 text-[13px] sm:shrink-0">
          <span className="text-fg-muted">Lift this ban?</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run()}
            className="focus-ring inline-flex min-h-11 items-center rounded-full font-semibold text-danger transition-colors hover:text-danger/80 disabled:opacity-60 sm:min-h-8"
          >
            {busy ? "Lifting…" : "Confirm"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirming(false)}
            className="focus-ring inline-flex min-h-11 items-center rounded-full font-semibold text-fg-muted transition-colors hover:text-fg disabled:opacity-60 sm:min-h-8"
          >
            Cancel
          </button>
        </div>
      ) : (
        <Button
          variant="danger-outline"
          size="sm"
          aria-label={`Unban ${entry.query}`}
          onClick={() => setConfirming(true)}
          className="shrink-0 self-start"
        >
          Unban
        </Button>
      )}
    </div>
  );
}
