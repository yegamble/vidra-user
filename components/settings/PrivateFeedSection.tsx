"use client";

import { useCallback, useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { CopyIcon, RotateCwIcon } from "@/components/icons";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { useT } from "@/components/I18nProvider";
import { Modal } from "@/components/ui/Modal";
import { api, errorMessage } from "@/lib/api";
import type { FeedTokenStatus } from "@/lib/api";

// The private subscriptions feed: a secret URL a feed reader can poll without a
// bearer header (GET /feeds/subscriptions.xml?token=…). The backend stores only
// a hash, so the URL is visible exactly once — right after "Generate" or
// "Rotate" — and the section says so rather than pretending it can show it again.
export function PrivateFeedSection() {
  const t = useT();
  const { status } = useSession();
  const [token, setToken] = useState<FeedTokenStatus | null>(null);
  const [issuedUrl, setIssuedUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Rotating or turning off breaks every reader already subscribed to the old
  // URL, instantly and silently, so both ask first.
  const [confirm, setConfirm] = useState<"rotate" | "off" | null>(null);
  const [noUrl, setNoUrl] = useState(false);

  useEffect(() => {
    if (status !== "authed") return;
    let live = true;
    api
      .getFeedToken()
      .then((t) => live && setToken(t))
      .catch((e) => live && setError(errorMessage(e, t("settings.feed.loadError"))));
    return () => {
      live = false;
    };
  }, [status, t]);

  const rotate = useCallback(async () => {
    setBusy(true);
    setError(null);
    setCopied(false);
    setNoUrl(false);
    try {
      const issued = await api.rotateFeedToken();
      setIssuedUrl(issued.url ?? null);
      // No PUBLIC_BASE_URL on the server: a token exists but no URL can be
      // built. Say so instead of leaving a "configured" feed nobody can reach.
      setNoUrl(!issued.url);
      setToken({ configured: true, created_at: issued.created_at });
    } catch (e) {
      setError(errorMessage(e, t("settings.feed.generateError")));
    } finally {
      setBusy(false);
    }
  }, [t]);

  const revoke = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await api.revokeFeedToken();
      setIssuedUrl(null);
      setNoUrl(false);
      setToken({ configured: false });
    } catch (e) {
      setError(errorMessage(e, t("settings.feed.offError")));
    } finally {
      setBusy(false);
    }
  }, [t]);

  const copy = useCallback(async () => {
    if (!issuedUrl) return;
    try {
      await navigator.clipboard.writeText(issuedUrl);
      setCopied(true);
    } catch {
      // Clipboard can be unavailable; the field stays selectable.
      setCopied(false);
    }
  }, [issuedUrl]);

  if (status !== "authed") return null;

  const configured = token?.configured === true;
  return (
    <section
      aria-label={t("settings.feed.label")}
      className="mt-6 max-w-xl rounded-2xl border border-border-subtle bg-surface p-4"
    >
      <h2 className="text-headline">{t("settings.feed.title")}</h2>
      <p className="mt-1 text-subhead text-fg-muted">
        {t("settings.feed.intro")}
      </p>
      {error ? (
        <Alert variant="danger" className="mt-3">
          {error}
        </Alert>
      ) : null}
      {noUrl ? (
        <Alert variant="warning" className="mt-3">
          {t("settings.feed.noUrl")}
        </Alert>
      ) : null}
      {issuedUrl ? (
        <div className="mt-3 flex items-center gap-2">
          <input
            readOnly
            aria-label={t("settings.feed.title")}
            value={issuedUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-canvas px-3 py-2 text-subhead"
          />
          <Button type="button" variant="secondary" size="sm" onClick={copy}>
            <CopyIcon size={16} /> {copied ? t("settings.feed.copied") : t("settings.feed.copy")}
          </Button>
        </div>
      ) : null}
      {issuedUrl ? (
        <p className="mt-2 text-footnote text-fg-muted">
          {t("settings.feed.onlyOnce")}
        </p>
      ) : configured ? (
        <p className="mt-3 text-subhead text-fg-muted">
          {t("settings.feed.isOn")}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => (configured ? setConfirm("rotate") : void rotate())}>
          <RotateCwIcon size={16} /> {configured ? t("settings.feed.rotate") : t("settings.feed.generate")}
        </Button>
        {configured ? (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setConfirm("off")}>
            {t("settings.feed.turnOff")}
          </Button>
        ) : null}
      </div>
      {confirm ? (
        <Modal
          title={confirm === "rotate" ? t("settings.feed.rotateTitle") : t("settings.feed.offTitle")}
          onClose={() => setConfirm(null)}
        >
          <p className="text-sm text-fg-muted">
            {confirm === "rotate" ? t("settings.feed.confirmRotate") : t("settings.feed.confirmOff")}
          </p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setConfirm(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={() => {
                const which = confirm;
                setConfirm(null);
                void (which === "rotate" ? rotate() : revoke());
              }}
            >
              {confirm === "rotate" ? t("settings.feed.rotate") : t("settings.feed.turnOff")}
            </Button>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
