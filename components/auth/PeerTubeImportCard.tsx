"use client";

import { useEffect, useRef, useState } from "react";

import { useT } from "@/components/I18nProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, authApi } from "@/lib/api";
import type { PeerTubeArchiveImportSummary, PeerTubeFollowImportStatus } from "@/lib/api";
import type { PlainMessageKey } from "@/lib/i18n";

const IMPORT_ERRORS: Record<number, PlainMessageKey> = {
  403: "account.peertube.disabled",
  413: "account.peertube.tooLarge",
  422: "account.peertube.invalid",
  429: "account.peertube.limited",
};
const SKIP_LABELS: Record<string, PlainMessageKey> = {
  playlist_items_not_addable: "account.peertube.skip.unavailable",
  playlist_items_over_cap: "account.peertube.skip.limit",
  following: "account.peertube.skip.following",
  watch_later_playlists: "account.peertube.skip.watchLater",
  videos: "account.peertube.skip.videos", comments: "account.peertube.skip.comments",
  likes: "account.peertube.skip.likes", dislikes: "account.peertube.skip.dislikes",
  watch_history: "account.peertube.skip.history", blocklist: "account.peertube.skip.blocklist",
  followers: "account.peertube.skip.followers", watched_words: "account.peertube.skip.words",
  automatic_tag_policies: "account.peertube.skip.tags",
};

export function PeerTubeImportCard() {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const upload = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<PeerTubeArchiveImportSummary | null>(null);
  const [progress, setProgress] = useState<PeerTubeFollowImportStatus | null>(null);
  const [followError, setFollowError] = useState(false);
  const [paused, setPaused] = useState(false);
  const [retry, setRetry] = useState(0);
  const jobId = summary?.follows_job_id;

  useEffect(() => () => upload.current?.abort(), []);
  useEffect(() => {
    if (!jobId || paused) return;
    const id = jobId;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      try {
        const status = await authApi.getPeerTubeFollowImport(id, controller.signal);
        if (controller.signal.aborted) return;
        setProgress(status);
        if (status.pending > 0) timer = setTimeout(() => void poll(), 2_000);
      } catch {
        if (!controller.signal.aborted) setFollowError(true);
      }
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [jobId, paused, retry]);

  async function submit() {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setError(t("account.peertube.zipRequired"));
      return;
    }
    const controller = new AbortController();
    upload.current = controller;
    setBusy(true);
    setError(null);
    setSummary(null);
    setProgress(null);
    setPaused(false);
    setFollowError(false);
    try {
      const result = await authApi.importPeerTubeArchive(file, controller.signal);
      if (controller.signal.aborted) return;
      setSummary(result);
      setFile(null);
      if (input.current) input.current.value = "";
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(t(err instanceof ApiError ? IMPORT_ERRORS[err.status] ?? "account.peertube.importError" : "account.peertube.importError"));
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface p-4">
      <h3 className="text-[15px] font-bold tracking-tight text-fg">{t("account.peertube.title")}</h3>
      <p className="text-sm text-fg-muted">{t("account.peertube.description")}</p>
      {error ? <Alert>{error}</Alert> : null}
      <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <label className="flex flex-col gap-2 text-sm text-fg">
          {t("account.peertube.file")}
          <input ref={input} type="file" accept=".zip,application/zip" disabled={busy}
            onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(null); }}
            className="focus-ring min-h-11 max-w-full rounded-xl border border-border p-2" />
        </label>
        <Button className="self-start" disabled={!file || busy} type="submit">
          {t(busy ? "account.peertube.importing" : "account.peertube.import")}
        </Button>
        {busy ? <Button className="self-start" variant="danger-outline" onClick={() => { upload.current?.abort(); setBusy(false); }}>
          {t("account.peertube.cancel")}
        </Button> : null}
      </form>
      {summary ? <div className="flex flex-col gap-2 text-sm text-fg" aria-live="polite">
        <p className="font-semibold">{t("account.peertube.imported")}</p>
        <p>{t("account.peertube.channels", { created: summary.channels_created, existing: summary.channels_existing, skipped: summary.channels_skipped })}</p>
        <p>{t("account.peertube.playlists", { created: summary.playlists_created, existing: summary.playlists_existing, skipped: summary.playlists_skipped })}</p>
        {"playlist_items_added" in summary && typeof summary.playlist_items_added === "number" ? <p>{t("account.peertube.itemsAdded", { count: summary.playlist_items_added })}</p> : null}
        <p>{t("account.peertube.itemsSkipped", { count: summary.playlist_items_skipped })}</p>
        <p>{t("account.peertube.settings", { count: summary.settings_applied })}</p>
        {"channel_images_set" in summary && typeof summary.channel_images_set === "number" && "channel_images_skipped" in summary && typeof summary.channel_images_skipped === "number" ? <p>{t("account.peertube.images", { added: summary.channel_images_set, skipped: summary.channel_images_skipped })}</p> : null}
        <p>{t("account.peertube.followsQueued", { queued: summary.follows_queued, skipped: summary.follows_skipped_federation })}</p>
        {summary.channels_mapped.map(({ from, to }) => <p key={from}>{t("account.peertube.renamed", { from, to })}</p>)}
        {Object.entries(summary.skipped_sections).some(([, count]) => count > 0) ? <ul className="list-inside list-disc text-fg-muted">
          {Object.entries(summary.skipped_sections).filter(([, count]) => count > 0).map(([reason, count]) =>
            <li key={reason}>{t("account.peertube.skipped", { section: t(SKIP_LABELS[reason] ?? "account.peertube.skip.other"), count })}</li>)}
        </ul> : null}
      </div> : null}
      {jobId ? <div className="flex flex-col gap-2 text-sm text-fg-muted">
        {progress ? <p role="status">{t("account.peertube.progress", { done: progress.done, pending: progress.pending, failed: progress.failed, skipped: progress.skipped_federation + progress.skipped_invalid, total: progress.total })}</p> : !followError && !paused ? <Spinner label={t("account.peertube.loading")} /> : null}
        {progress?.pending === 0 ? <p>{t("account.peertube.finished")}</p> : followError ? <>
          <Alert>{t("account.peertube.followError")}</Alert>
          <Button className="self-start" variant="secondary" onClick={() => { setFollowError(false); setRetry((value) => value + 1); }}>{t("account.peertube.retry")}</Button>
        </> : <>
          {paused ? <p>{t("account.peertube.paused")}</p> : null}
          <Button className="self-start" variant="secondary" onClick={() => setPaused((value) => !value)}>{t(paused ? "account.peertube.resume" : "account.peertube.pause")}</Button>
        </>}
      </div> : null}
    </div>
  );
}
