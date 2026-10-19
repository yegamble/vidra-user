"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { CloseIcon, LockIcon, MessageCircleIcon, SearchIcon } from "@/components/icons";
import { InboxTabs } from "@/components/InboxTabs";
import { NewMessageButton } from "@/components/NewMessageButton";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { api, userAvatarUrl } from "@/lib/api";
import type { ConversationSummary } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { SignInGate } from "@/components/SignInGate";
import { rememberConversations } from "@/lib/messaging/conversation-cache";

type Status = "loading" | "error" | "ready";

const INBOX_POLL_MS = 30_000;
const PAGE_LIMIT = 20;

function mergeConversations(previous: ConversationSummary[], incoming: ConversationSummary[]) {
  const rows = new Map(previous.map(c => [c.id, c]));
  for (const c of incoming) {
    const existing = rows.get(c.id);
    if (!existing || Date.parse(c.updated_at) >= Date.parse(existing.updated_at)) rows.set(c.id, c);
  }
  return [...rows.values()].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at) || b.id.localeCompare(a.id));
}

// threadHref builds the row's link, carrying the encrypted recipient hint (`to`)
// and the unread count (`unread`) the thread uses to place its NEW-messages
// divider on open. Both are optional UI hints; the thread degrades without them.
function threadHref(c: ConversationSummary): string {
  const params = new URLSearchParams();
  if (c.encrypted) params.set("to", c.other_user_id);
  if (c.unread_count && c.unread_count > 0) params.set("unread", String(c.unread_count));
  const qs = params.toString();
  return `/messages/${c.id}${qs ? `?${qs}` : ""}`;
}

// ConversationRail is the messenger's persistent inbox: the signed-in user's
// direct-message conversations as rows (avatar + name + snippet + compact time +
// unread weighting/badge), a search field that filters the loaded page, and a
// New-message entry point. It is the full-width surface on phones (/messages) and
// the left rail of the desktop split-pane. `titleAsH1` is true only when the rail
// is the page's primary surface (no thread open) so the page has exactly one h1.
export function ConversationRail({ titleAsH1 }: { titleAsH1: boolean }) {
  const { status, user } = useSession();

  const heading = titleAsH1 ? (
    <h1 className="text-title text-fg">Messages</h1>
  ) : (
    <p className="text-title text-fg">Messages</p>
  );

  if (status !== "authed") {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-6">
        {titleAsH1 ? <InboxTabs active="messages" /> : null}
        {heading}
        <SignInGate title="Sign in to see your messages">
          to read and send direct messages.
        </SignInGate>
      </div>
    );
  }

  return <Rail key={user?.id} heading={heading} showInboxTabs={titleAsH1} />;
}

function Rail({
  heading,
  showInboxTabs,
}: {
  heading: React.ReactNode;
  showInboxTabs: boolean;
}) {
  const { user } = useSession();
  const pathname = usePathname();
  const [status, setStatus] = useState<Status>("loading");
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const mountedRef = useRef(true);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (user) rememberConversations(user.id, items);
  }, [user, items]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getConversations({ limit: PAGE_LIMIT, offset: 0 }, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        setItems(mergeConversations([], res.conversations));
        setTotal(res.total);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [reloadKey]);

  // Keep the rail live: refetch every 30s while visible and on window focus,
  // updating snippets / unread badges in place (never flip back to loading).
  useEffect(() => {
    const refresh = () => {
      api
        .getConversations({ limit: PAGE_LIMIT, offset: 0 })
        .then((res) => {
          if (!mountedRef.current) return;
          setItems(previous => mergeConversations(previous, res.conversations));
          setTotal(res.total);
        })
        .catch(() => {});
    };
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, INBOX_POLL_MS);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  function retry() {
    setStatus("loading");
    setReloadKey((k) => k + 1);
  }

  async function loadMore() {
    if (loadingMore) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const res = await api.getConversations({ limit: PAGE_LIMIT, offset: items.length });
      if (!mountedRef.current) return;
      setItems(previous => mergeConversations(previous, res.conversations));
      setTotal(res.total);
    } catch {
      if (mountedRef.current) setMoreError("Could not load more conversations.");
    } finally {
      if (mountedRef.current) setLoadingMore(false);
    }
  }

  const hasMore = items.length < total;
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return items;
    return items.filter((c) => {
      const hay = `${c.other_display_name} ${c.other_username} ${c.last_message_body}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, q]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-3 px-4 pb-3 pt-6">
        {showInboxTabs ? <InboxTabs active="messages" /> : null}
        <div className="flex items-center justify-between gap-2">
          {heading}
          <NewMessageButton />
        </div>
        {status === "ready" && items.length > 0 ? (
          <div className="relative flex items-center">
            <SearchIcon size={18} className="pointer-events-none absolute left-3.5 text-fg-muted" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search conversations"
              placeholder="Search conversations"
              className="focus-ring h-11 w-full rounded-full bg-surface-muted pl-10 pr-11 text-base text-fg placeholder:text-fg-muted [&::-webkit-search-cancel-button]:appearance-none"
            />
            {query ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => { setQuery(""); searchRef.current?.focus(); }}
                className="focus-ring absolute right-0 inline-flex h-11 w-11 items-center justify-center rounded-full text-fg-muted transition-colors hover:text-fg"
              >
                <CloseIcon size={18} />
              </button>
            ) : null}
          </div>
        ) : null}
        {hasMore ? (
          <p className="text-footnote text-fg-muted">
            Searching loaded conversations. Load more to include older chats.
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {status === "loading" ? (
          <ul className="flex flex-col gap-1 px-2" aria-hidden>
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 py-3">
                <Skeleton className="h-11 w-11 rounded-full" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-1/3" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </li>
            ))}
          </ul>
        ) : status === "error" ? (
          <div className="px-2 pt-4">
            <ErrorState message="Could not load your messages." onRetry={retry} />
          </div>
        ) : items.length === 0 ? (
          <div className="px-2 pt-4">
            <EmptyState
              icon={<MessageCircleIcon size={24} />}
              title="No messages yet"
              message="Choose New message to start a conversation with someone on Vidra."
            />
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-4 pt-8 text-center text-sm text-fg-muted">
            No conversations match “{query.trim()}”.
          </p>
        ) : (
          <ul className="flex flex-col">
            {filtered.map((c) => {
              const name = c.other_display_name || c.other_username;
              const active = pathname === `/messages/${c.id}`;
              const unread = Boolean(c.unread_count && c.unread_count > 0);
              return (
                <li key={c.id}>
                  <Link
                    href={threadHref(c)}
                    aria-current={active ? "page" : undefined}
                    className={
                      "focus-ring flex items-center gap-3 rounded-xl px-2 py-3 transition-colors " +
                      (active ? "bg-accent/12" : "hover:bg-surface-muted")
                    }
                  >
                    <Avatar
                      src={userAvatarUrl(c.other_user_id)}
                      name={name}
                      className="h-11 w-11 shrink-0 text-base"
                    />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-center gap-1.5">
                        <span
                          className={
                            "truncate text-subhead " +
                            (unread || active ? "font-semibold " : "font-medium ") +
                            (active ? "text-accent-text" : "text-fg")
                          }
                        >
                          {name}
                        </span>
                        {c.encrypted ? (
                          <span
                            className="shrink-0 text-fg-muted"
                            aria-label="Encrypted conversation"
                            title="Encrypted conversation"
                          >
                            <LockIcon size={12} />
                          </span>
                        ) : null}
                        <span className="ml-auto shrink-0 text-caption tabular-nums text-fg-muted">
                          {relativeTime(c.last_message_at)}
                        </span>
                      </span>
                      <span
                        className={
                          "mt-0.5 truncate text-footnote " +
                          (unread ? "font-semibold text-fg" : "text-fg-muted")
                        }
                      >
                        {c.encrypted
                          ? "Encrypted conversation"
                          : c.last_message_body || "No messages yet"}
                      </span>
                    </div>
                    {unread ? (
                      <span
                        className="inline-flex min-h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold tabular-nums text-accent-fg"
                        aria-label={`${c.unread_count} unread ${c.unread_count === 1 ? "message" : "messages"}`}
                      >
                        {(c.unread_count ?? 0) > 99 ? "99+" : c.unread_count}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {status === "ready" && hasMore ? (
          <div className="flex flex-col items-center gap-2 px-4 pt-4">
            {moreError ? <p role="alert" className="text-sm text-danger">{moreError}</p> : null}
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => void loadMore()}
              className="focus-ring min-h-11 rounded-full border border-border px-4 text-sm font-semibold text-fg transition-colors hover:bg-surface-muted disabled:opacity-60"
            >
              {loadingMore ? "Loading conversations…" : "Load more conversations"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
