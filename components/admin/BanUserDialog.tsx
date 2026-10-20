"use client";

import { useState } from "react";

import { useT } from "@/components/I18nProvider";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";

/** Mirrors core's admin.MaxBanReasonLen (and the user_bans CHECK). */
const MAX_BAN_REASON = 500;

/**
 * BanUserDialog — banning needs a stated reason. Core stores it, shows it to
 * staff, and emails it to the user (their statement of reasons), so the copy
 * says so. The parent owns the request; this only collects the text.
 */
export function BanUserDialog({
  username,
  busy,
  onConfirm,
  onClose,
}: {
  username: string;
  busy: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();
  return (
    <Modal title={t("admin.ban.title", { username })} onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (trimmed !== "" && !busy) onConfirm(trimmed);
        }}
      >
        <p className="text-[13px] leading-relaxed text-fg-muted">
          {t("admin.ban.body", { username })}
        </p>
        <Textarea
          label={t("admin.ban.reason")}
          rows={4}
          maxLength={MAX_BAN_REASON}
          hint={`${trimmed.length}/${MAX_BAN_REASON}`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="flex items-center gap-2">
          <Button type="submit" variant="danger" disabled={busy || trimmed === ""}>
            {busy ? t("admin.ban.busy") : t("admin.ban.confirm", { username })}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
