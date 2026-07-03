"use client";

import Link from "next/link";
import { useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { ApiError, api } from "@/lib/api";
import { t } from "@/lib/i18n";

const MAX_REASON_LEN = 2000;

export type ReportKind = "video" | "comment" | "account" | "remote_video" | "message";

// reportNoun is the human word for a report kind ("account" reads as "user",
// a remote_video reads as plain "video" — the federation detail is the
// moderators' concern, not the reporter's).
function reportNoun(kind: ReportKind): string {
  if (kind === "account") return "user";
  if (kind === "remote_video") return "video";
  return kind;
}

// ReportButton lets an authenticated viewer file an abuse report against a video
// (local or federated remote), a comment, or an account. Anonymous viewers get a
// sign-in link instead. Clicking opens an accessible modal with a required
// reason; on success it confirms and the backend treats repeat reports
// idempotently.
export function ReportButton({
  kind,
  targetId,
  variant = "pill",
}: {
  kind: ReportKind;
  targetId: string;
  variant?: "pill" | "link";
}) {
  const { status } = useSession();
  const [open, setOpen] = useState(false);

  if (status !== "authed") {
    return (
      <Link
        href="/login"
        className={
          variant === "pill"
            ? "rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            : "text-xs font-medium text-zinc-500 hover:text-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:text-zinc-400 dark:hover:text-zinc-200"
        }
      >
        Sign in to report
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        aria-label={`Report this ${reportNoun(kind)}`}
        onClick={() => setOpen(true)}
        className={
          variant === "pill"
            ? "flex items-center gap-1.5 rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            : "text-xs font-medium text-zinc-500 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:text-zinc-400 dark:hover:text-red-400"
        }
      >
        {variant === "pill" ? <span aria-hidden>⚑</span> : null}
        <span>{kind === "account" ? "Report user" : "Report"}</span>
      </button>
      {open ? (
        <ReportDialog kind={kind} targetId={targetId} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

type DialogState = "idle" | "submitting" | "done";

function ReportDialog({
  kind,
  targetId,
  onClose,
}: {
  kind: ReportKind;
  targetId: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [state, setState] = useState<DialogState>("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const trimmed = reason.trim();
    if (trimmed === "" || state === "submitting") return;
    setState("submitting");
    setError(null);
    try {
      if (kind === "video") {
        await api.reportVideo(targetId, trimmed);
      } else if (kind === "remote_video") {
        await api.reportRemoteVideo(targetId, trimmed);
      } else if (kind === "comment") {
        await api.reportComment(targetId, trimmed);
      } else if (kind === "message") {
        await api.reportMessage(targetId, trimmed);
      } else {
        await api.reportAccount(targetId, trimmed);
      }
      setState("done");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("report.genericError"));
      setState("idle");
    }
  }

  // Refactored onto the shared primitives (Modal focus-trap/Escape/backdrop +
  // Textarea + Button) to prove the primitive layer. The dialog's accessible
  // name still resolves to "Report this <noun>" (via the Modal title → h2 →
  // aria-labelledby), and the reason field keeps its "Reason for report" label,
  // so the existing report Playwright selectors are unchanged.
  return (
    <Modal title={t("report.title", { noun: reportNoun(kind) })} onClose={onClose}>
      {state === "done" ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-fg-muted">{t("report.signedInThanks")}</p>
          <div className="flex justify-end">
            <Button size="sm" onClick={onClose}>
              {t("common.close")}
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Textarea
            label={t("report.reasonLabel")}
            placeholder={t("report.reasonPlaceholder")}
            rows={4}
            maxLength={MAX_REASON_LEN}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={error ?? undefined}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={state === "submitting" || reason.trim() === ""}
            >
              {t("report.submit")}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
