"use client";

import { useState } from "react";

import { useT } from "@/components/I18nProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ApiError, api, errorMessage } from "@/lib/api";

type Step = "form" | "confirm" | "sending" | "sent" | "withdrawn";

// A give answered 409 because an earlier offer of this video is still pending.
function isPendingConflict(err: unknown): boolean {
  return err instanceof ApiError && err.status === 409 && /already pending/i.test(err.message);
}

// TransferOwnershipDialog offers one of the caller's videos to another member
// of this instance (core 0165, PeerTube's "give ownership"). Two steps on
// purpose: handing a video away is not undone by the giver once accepted, so
// the confirm step says what happens — nothing until the recipient accepts,
// then the video leaves the caller's channel for good. Until then the offer can
// be withdrawn (DELETE /videos/{id}/give-ownership), from here.
export function TransferOwnershipDialog({
  videoId,
  videoTitle,
  onClose,
}: {
  videoId: string;
  videoTitle: string;
  onClose: () => void;
}) {
  const t = useT();
  const [step, setStep] = useState<Step>("form");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingConflict, setPendingConflict] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // People type handles the way the app shows them; the server wants the bare name.
  const name = username.trim().replace(/^@/, "");

  async function send() {
    setStep("sending");
    setError(null);
    setPendingConflict(false);
    try {
      await api.giveVideoOwnership(videoId, name);
      setStep("sent");
    } catch (err) {
      setPendingConflict(isPendingConflict(err));
      setError(
        err instanceof ApiError && err.status === 404 && /user/i.test(err.message)
          ? t("studio.transfer.noUser", { name })
          : errorMessage(err, t("studio.transfer.sendError")),
      );
      setStep("confirm");
    }
  }

  // Withdraw the pending offer of this video: the one just sent, or an older
  // one that blocks a new offer.
  async function withdraw(after: "withdrawn" | "form") {
    setBusy(true);
    setError(null);
    try {
      await api.cancelVideoOwnership(videoId);
      setPendingConflict(false);
      if (after === "form")
        setNotice(t("studio.transfer.withdrawnNotice"));
      setStep(after);
    } catch (err) {
      setError(errorMessage(err, t("studio.transfer.withdrawError")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t("studio.transfer.title")} onClose={onClose}>
      {step === "form" ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (name !== "") {
              setNotice(null);
              setStep("confirm");
            }
          }}
        >
          {notice ? (
            <p role="status" className="text-sm text-fg">
              {notice}
            </p>
          ) : null}
          <Input
            label={t("studio.transfer.recipient")}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="off"
            hint={t("studio.transfer.hint")}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              {t("studio.transfer.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={name === ""}>
              {t("studio.transfer.continue")}
            </Button>
          </div>
        </form>
      ) : step === "sent" || step === "withdrawn" ? (
        <div className="flex flex-col gap-4">
          <p role="status" className="text-sm text-fg">
            {step === "sent"
              ? t("studio.transfer.sent", { name })
              : t("studio.transfer.withdrawn")}
          </p>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            {step === "sent" ? (
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => void withdraw("withdrawn")}>
                {t("studio.transfer.withdraw")}
              </Button>
            ) : null}
            <Button size="sm" disabled={busy} onClick={onClose}>
              {t("studio.transfer.done")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm font-semibold text-fg">
            {t("studio.transfer.offer", { title: videoTitle, name })}
          </p>
          <p className="text-sm text-fg-muted">{t("studio.transfer.confirmBody")}</p>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            {pendingConflict ? (
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => void withdraw("form")}>
                {t("studio.transfer.withdrawPending")}
              </Button>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              disabled={step === "sending" || busy}
              onClick={() => {
                setError(null);
                setPendingConflict(false);
                setStep("form");
              }}
            >
              {t("studio.transfer.back")}
            </Button>
            <Button size="sm" disabled={step === "sending" || busy} onClick={() => void send()}>
              {t("studio.transfer.send")}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
