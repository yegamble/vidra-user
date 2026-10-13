"use client";

import Link from "next/link";
import { useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { FlagIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { useT } from "@/components/I18nProvider";
import { api, errorMessage } from "@/lib/api";
import type { ReportReason } from "@/lib/api";
import { parseTimestamp, REPORT_REASONS } from "@/lib/report-reasons";

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
            ? "focus-ring inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-surface-muted px-4 py-2 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-strong"
            : "focus-ring rounded text-xs font-semibold text-fg-muted transition-colors hover:text-fg"
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
            ? // Design: Report reads quieter than the other actions (fg-muted).
              "focus-ring flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-muted px-4 py-2 text-[13px] font-semibold text-fg-muted transition-colors hover:bg-surface-strong hover:text-fg"
            : "focus-ring rounded text-xs font-semibold text-fg-muted transition-colors hover:text-danger"
        }
      >
        {variant === "pill" ? <FlagIcon size={16} /> : null}
        <span>{kind === "account" ? "Report user" : "Report"}</span>
      </button>
      {open ? (
        <ReportDialog kind={kind} targetId={targetId} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

type DialogState = "idle" | "submitting" | "done";

export function ReportDialog({
  kind,
  targetId,
  onClose,
}: {
  kind: ReportKind;
  targetId: string;
  onClose: () => void;
}) {
  const t = useT();
  const [reason, setReason] = useState("");
  // Local video reports only: PeerTube-style reasons + an optional time range.
  const [reasons, setReasons] = useState<ReportReason[]>([]);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [state, setState] = useState<DialogState>("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const trimmed = reason.trim();
    if (trimmed === "" || state === "submitting") return;
    let detail: { reasons?: ReportReason[]; start_seconds?: number; end_seconds?: number } = {};
    if (kind === "video") {
      const start = startAt.trim() === "" ? undefined : parseTimestamp(startAt);
      const end = endAt.trim() === "" ? undefined : parseTimestamp(endAt);
      if (start === null || end === null) {
        setRangeError(t("report.timeInvalid"));
        return;
      }
      if (end !== undefined && (start === undefined || end <= start)) {
        setRangeError(t("report.timeOrder"));
        return;
      }
      detail = {
        ...(reasons.length > 0 ? { reasons } : {}),
        ...(start !== undefined ? { start_seconds: start } : {}),
        ...(end !== undefined ? { end_seconds: end } : {}),
      };
    }
    setRangeError(null);
    setState("submitting");
    setError(null);
    try {
      if (kind === "video") {
        await (Object.keys(detail).length > 0
          ? api.reportVideo(targetId, trimmed, detail)
          : api.reportVideo(targetId, trimmed));
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
      setError(errorMessage(err, t("report.genericError")));
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
          {kind === "video" ? (
            <>
              <fieldset className="flex flex-col gap-1.5">
                <legend className="mb-1 text-sm font-medium text-fg">
                  {t("report.categoriesLegend")}
                </legend>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {REPORT_REASONS.map((r) => (
                    <Checkbox
                      key={r.value}
                      label={r.label}
                      checked={reasons.includes(r.value)}
                      onChange={(e) =>
                        setReasons((cur) =>
                          e.target.checked ? [...cur, r.value] : cur.filter((x) => x !== r.value),
                        )
                      }
                    />
                  ))}
                </div>
              </fieldset>
              <fieldset className="flex flex-col gap-1.5">
                <legend className="mb-1 text-sm font-medium text-fg">
                  {t("report.timeLegend")}
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    label={t("report.timeStart")}
                    placeholder="0:30"
                    inputMode="numeric"
                    value={startAt}
                    onChange={(e) => setStartAt(e.target.value)}
                  />
                  <Input
                    label={t("report.timeEnd")}
                    placeholder="1:15"
                    inputMode="numeric"
                    value={endAt}
                    onChange={(e) => setEndAt(e.target.value)}
                    error={rangeError ?? undefined}
                  />
                </div>
              </fieldset>
            </>
          ) : null}
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
