"use client";

import { SignInGate } from "@/components/SignInGate";
import { Badge } from "@/components/ui/Badge";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/api";
import type { MyReport } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import { useSettledSession } from "@/lib/use-settled-session";

import { REPORT_STATUS, reportSubject } from "./MyReportsView";
import { ReportThread } from "./ReportThread";

// MyReportDetail is one of the caller's own reports: its state, what it was
// about, their own reason, and the conversation with the moderators. The
// moderator's internal note is never part of it — the server does not send it.
// Viewer-scoped like MyReportsView: nothing is fetched until the session
// settles, and a switch of account remounts the view for the new viewer.
export function MyReportDetail({ reportId }: { reportId: string }) {
  const viewer = useSettledSession();
  if (!viewer.settled) return <Spinner label="Loading the report" />;
  if (!viewer.authed) {
    return <SignInGate title="Sign in to see this report">to follow up on reports you filed.</SignInGate>;
  }
  return <Detail key={viewer.viewerKey} reportId={reportId} />;
}

function Detail({ reportId }: { reportId: string }) {
  const report = useApiResource<MyReport>((signal) => api.getMyReport(reportId, signal), [reportId]);
  if (report.status === "loading") return <Spinner label="Loading the report" />;
  if (report.status === "error" || !report.data) {
    return <ErrorState message="Could not load this report." onRetry={report.retry} />;
  }
  const r = report.data;
  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Report" className="flex flex-col gap-2 rounded-2xl bg-surface p-4 shadow-soft">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="min-w-0 flex-1 text-headline text-fg">{reportSubject(r)}</h2>
          <Badge variant={REPORT_STATUS[r.status].variant} status>
            {REPORT_STATUS[r.status].label}
          </Badge>
        </div>
        <p className="text-footnote text-fg-muted">
          {r.target_type.replaceAll("_", " ")} report · filed {relativeTime(r.created_at)}
          {r.resolved_at ? ` · resolved ${relativeTime(r.resolved_at)}` : ""}
        </p>
        <p className="text-sm text-fg-muted">
          <span className="font-semibold text-fg">Your reason: </span>
          <span className="whitespace-pre-wrap break-words">{r.reason}</span>
        </p>
      </section>
      <div className="rounded-2xl bg-surface p-4 shadow-soft">
        <ReportThread reportId={r.id} viewer="reporter" />
      </div>
    </div>
  );
}
