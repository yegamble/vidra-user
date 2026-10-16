"use client";

import { useState, type FormEvent } from "react";

import { useT } from "@/components/I18nProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";

/**
 * Password step-up for the one-click provider writes (enable/disable, delete),
 * the same shape as the admin password-reset-link dialog: the admin's own
 * password, held only until the attempt, then handed to `run`. `run` resolves
 * to null on success or the message to show inline (a 422 "disable or edit it
 * instead", a 429 from the strict limiter, a wrong password).
 */
export function OIDCConfirmDialog({
  title,
  body,
  submitLabel,
  danger = false,
  run,
  onClose,
}: {
  title: string;
  body: string;
  submitLabel: string;
  danger?: boolean;
  run: (password: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const t = useT();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || password === "") return;
    setBusy(true);
    setError(null);
    const proof = password;
    setPassword("");
    const failure = await run(proof);
    if (failure !== null) {
      setError(failure);
      setBusy(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
        <p className="text-[13px] leading-relaxed text-fg-muted">{body}</p>
        <Input
          type="password"
          label={t("admin.oidc.form.password")}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error ? <Alert>{error}</Alert> : null}
        <div className="flex items-center gap-2">
          <Button type="submit" variant={danger ? "danger" : "primary"} disabled={busy || password === ""}>
            {busy ? t("admin.oidc.confirm.working") : submitLabel}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("admin.oidc.form.cancel")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
