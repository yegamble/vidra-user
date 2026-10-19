"use client";

import { useEffect, useState } from "react";
import { LockIcon } from "@/components/icons";
import { Spinner } from "@/components/ui/Spinner";
import { useT } from "@/components/I18nProvider";
import { ApiError, errorMessage } from "@/lib/api";
import { getEngine, type LocalDevice } from "@/lib/e2ee/engine";
import { prepareDevice } from "@/lib/e2ee/prepare";

export function DeviceSetup({ onReady }: { onReady: (device: LocalDevice) => void }) {
  const t = useT();
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => {
    let active = true;
    void prepareDevice().then((device) => {
      if (active) onReady(device);
    }).catch((err) => {
      if (!active) return;
      setRemoved(err instanceof Error && err.name === "DeviceRemovedError");
      setError(err instanceof ApiError && err.status === 422
        ? t("settings.secure.deviceLimit")
        : errorMessage(err, t("settings.secure.prepareError")));
    });
    return () => { active = false; };
  }, [attempt, onReady, t]);

  function retry() { setError(null); setAttempt((value) => value + 1); }
  async function reset() {
    try {
      await (await getEngine()).forgetDevice();
      setConfirmReset(false);
      setRemoved(false);
      retry();
    } catch { setError(t("settings.secure.prepareError")); }
  }
  return (
    <section className="mx-auto flex max-w-md flex-col gap-3 rounded-2xl border border-border-subtle bg-surface p-4">
      <div className="flex items-center gap-2 text-fg">
        <LockIcon size={20} />
        <h2 className="text-base font-semibold">{t("settings.secure.preparing")}</h2>
      </div>
      {error ? <>
        <p role="alert" className="text-sm text-danger">{error}</p>
        <button type="button" onClick={retry} className="focus-ring min-h-11 self-start rounded-xl bg-accent px-4 font-semibold text-accent-fg">{t("common.retry")}</button>
        {removed ? <button type="button" onClick={() => setConfirmReset(true)} className="focus-ring min-h-11 self-start rounded-xl px-3 text-sm text-fg">{t("settings.secure.reset")}</button> : null}
        {confirmReset ? <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
          <p className="text-sm text-fg-muted">{t("settings.secure.resetWarning")}</p>
          <button type="button" onClick={() => void reset()} className="focus-ring min-h-11 rounded-xl bg-danger-solid px-3 text-sm font-semibold text-danger-fg">{t("settings.secure.resetConfirm")}</button>
          <button type="button" onClick={() => setConfirmReset(false)} className="focus-ring min-h-11 rounded-xl px-3 text-sm text-fg">{t("common.cancel")}</button>
        </div> : null}
      </> : <Spinner label={t("settings.secure.preparing")} />}
      <p className="text-sm text-fg-muted">{t("settings.secure.preparingHelp")}</p>
    </section>
  );
}
