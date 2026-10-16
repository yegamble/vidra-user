"use client";

import { useState } from "react";

import { useT } from "@/components/I18nProvider";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/api";

/** Mounted only for admins: moderators cannot clear failed-login locks. */
export function UnlockSignInButton({ userId, username }: { userId: string; username: string }) {
  const t = useT();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function unlock() {
    if (busy) return;
    setBusy(true);
    try {
      await api.clearUserLoginLockout(userId);
      toast({ message: t("admin.loginLockout.success", { name: username }), variant: "success" });
    } catch (err) {
      toast({ message: errorMessage(err, t("admin.loginLockout.error")), variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="tonal"
      size="sm"
      aria-label={t("admin.loginLockout.aria", { name: username })}
      disabled={busy}
      onClick={() => void unlock()}
    >
      {t(busy ? "admin.loginLockout.busy" : "admin.loginLockout.action")}
    </Button>
  );
}
