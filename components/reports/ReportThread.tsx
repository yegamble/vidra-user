"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { api, errorMessage } from "@/lib/api";
import type { ReportMessage, ReportMessageListResponse } from "@/lib/api";
import { FULL_LIST_LIMIT } from "@/lib/api/pagination";
import { cn } from "@/lib/cn";
import { relativeTime } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";

const MAX_MESSAGE_LEN = 3000;

/** Who wrote a message, as this viewer may know it. The reporter is never told which moderator wrote. */
function authorLabel(m: ReportMessage, viewer: "reporter" | "staff"): string {
  if (m.is_mine) return "You";
  if (viewer === "reporter") return "Moderator";
  return `${m.author_username || "Deleted account"} · ${m.by_moderator ? "Moderator" : "Reporter"}`;
}

// ReportThread is the conversation between a report's reporter and the
// moderation team (core 0163), shared by "My reports" and the moderation queue.
// Bodies are untrusted user text and render as PLAIN text — never markdown or
// HTML. A thread the server marks read-only (a report another instance filed)
// shows why instead of a composer.
export function ReportThread({ reportId, viewer }: { reportId: string; viewer: "reporter" | "staff" }) {
  const thread = useApiResource<ReportMessageListResponse>(
    (signal) => api.getReportMessages(reportId, { limit: FULL_LIST_LIMIT }, signal),
    [reportId],
  );
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const sent = await api.postReportMessage(reportId, body);
      thread.setData((t) => (t ? { ...t, messages: [...t.messages, sent], total: t.total + 1 } : t));
      setDraft("");
    } catch (err) {
      setError(errorMessage(err, "Could not send your message."));
    } finally {
      setSending(false);
    }
  }

  if (thread.status === "loading") return <Spinner label="Loading messages" />;
  if (thread.status === "error" || !thread.data) {
    return <ErrorState message="Could not load the messages for this report." onRetry={thread.retry} />;
  }
  const { messages, can_reply: canReply } = thread.data;

  return (
    <section aria-label="Messages about this report" className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-fg">Messages</h3>
      {messages.length === 0 ? (
        <p className="text-footnote text-fg-muted">No messages yet.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {messages.map((m) => (
            <li
              key={m.id}
              className={cn(
                "rounded-xl px-3.5 py-2.5",
                m.is_mine ? "bg-accent/10" : "border border-border-subtle bg-surface",
              )}
            >
              <p className="text-footnote text-fg-muted">
                <span className="font-semibold text-fg">{authorLabel(m, viewer)}</span>
                <span aria-hidden> · </span>
                <time dateTime={m.created_at}>{relativeTime(m.created_at)}</time>
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-fg">{m.body}</p>
            </li>
          ))}
        </ol>
      )}
      {canReply ? (
        <form onSubmit={send} className="flex flex-col gap-2">
          <Textarea
            aria-label="Message"
            rows={3}
            maxLength={MAX_MESSAGE_LEN}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={viewer === "reporter" ? "Add context or ask the moderators a question" : "Write to the reporter"}
            error={error ?? undefined}
          />
          <Button type="submit" size="sm" className="self-end" disabled={!draft.trim() || sending}>
            Send
          </Button>
        </form>
      ) : (
        <p className="text-footnote text-fg-muted">
          This report was filed by another instance, so there is no one here to reply to.
        </p>
      )}
    </section>
  );
}
