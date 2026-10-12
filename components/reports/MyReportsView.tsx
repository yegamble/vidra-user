"use client";

import Link from "next/link";

import { useSession } from "@/components/auth/AuthProvider";
import { FlagIcon } from "@/components/icons";
import { SignInGate } from "@/components/SignInGate";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ListTail } from "@/components/ui/ListTail";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/api";
import type { MyReport } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { useAppendingList } from "@/lib/use-appending-list";
import { useBrowseAutoLoad } from "@/lib/use-browse-auto-load";

export const REPORT_STATUS: Record<MyReport["status"], { label: string; variant: BadgeVariant }> = {
  open: { label: "Open", variant: "warning" },
  accepted: { label: "Accepted", variant: "success" },
  rejected: { label: "Rejected", variant: "strong" },
};

/** What the report was about, as far as the server still lets the reporter see it. */
export function reportSubject(r: MyReport): string {
  switch (r.target_type) {
    case "video":
      return r.video_title ? `“${r.video_title}”` : "A video";
    case "remote_video":
      return r.remote_video_title ? `“${r.remote_video_title}”` : "A video from another instance";
    case "account":
      return r.reported_username ? `@${r.reported_username}` : "An account";
    case "comment":
      return "A comment";
    default:
      return "A direct message";
  }
}

// MyReportsView is the reporter's own list of abuse reports (PeerTube's "My
// abuse reports"): each one's state, what it was about and its thread
// activity, most recently active first, linking to the report's page.
export function MyReportsView() {
  const { status } = useSession();
  if (status !== "authed") {
    return <SignInGate title="Sign in to see your reports">to follow up on reports you filed.</SignInGate>;
  }
  return <Reports />;
}

function Reports() {
  const autoLoad = useBrowseAutoLoad();
  const list = useAppendingList<MyReport>({
    queryKey: "my-reports",
    getId: (r) => r.id,
    load: (window, signal) =>
      api.getMyReports(window, signal).then((res) => ({ items: res.reports, total: res.total })),
  });

  if (list.status === "loading") return <Spinner label="Loading your reports" />;
  if (list.status === "error") {
    return <ErrorState message="Could not load your reports." onRetry={list.reload} />;
  }
  if (list.items.length === 0) {
    return (
      <EmptyState
        icon={<FlagIcon size={22} />}
        title="No reports yet"
        message="When you report a video, comment or account, you can follow it up here."
      />
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col divide-y divide-border-subtle overflow-hidden rounded-2xl bg-surface shadow-soft">
        {list.items.map((r) => (
          <li key={r.id}>
            <Link
              href={`/settings/reports/${encodeURIComponent(r.id)}`}
              className="focus-ring flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-surface-muted"
            >
              <span className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{reportSubject(r)}</span>
                <Badge variant={REPORT_STATUS[r.status].variant} status>
                  {REPORT_STATUS[r.status].label}
                </Badge>
              </span>
              <span className="text-footnote text-fg-muted">
                {r.target_type.replaceAll("_", " ")} report · updated {relativeTime(r.last_activity_at)}
                {r.message_count > 0
                  ? ` · ${r.message_count} ${r.message_count === 1 ? "message" : "messages"}`
                  : ""}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <ListTail
        hasMore={list.hasMore}
        autoLoad={autoLoad}
        busy={list.moreStatus === "loading"}
        error={list.moreStatus === "error" ? "Could not load more reports." : null}
        onLoadMore={list.loadMore}
      />
    </div>
  );
}
