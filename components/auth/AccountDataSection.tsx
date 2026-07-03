"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Spinner } from "@/components/ui/Spinner";
import { ApiError, authApi } from "@/lib/api";
import type { AccountArchive, AccountExportStatus, AccountImportSummary } from "@/lib/api";

// How often the export card re-reads GET /me/export while the job is
// pending/running. The archive is assembled by a background job, so the UI
// polls honestly instead of pretending the request finished.
const EXPORT_POLL_MS = 2_000;

// The human-readable names for the archive sections import cannot re-create
// in v1 (reported per section in the summary's skipped_sections).
const SKIPPED_SECTION_LABELS: Record<string, string> = {
  channels: "Channels",
  videos: "Videos",
  comments: "Comments",
  saved_videos: "Saved videos",
  watch_history: "Watch history",
  playlists: "Playlists",
};

type ExportView =
  | { kind: "loading" }
  | { kind: "load-error" }
  | { kind: "none" } // no export was ever requested (or it expired away)
  | { kind: "status"; status: AccountExportStatus };

/**
 * AccountDataSection is the /settings "Your data" surface: request/track/
 * download the account export archive, and import one back (safe subsets).
 */
export function AccountDataSection() {
  return (
    <section className="flex max-w-xl flex-col gap-4" aria-labelledby="your-data-heading">
      <h2 id="your-data-heading" className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
        Your data
      </h2>
      <ExportCard />
      <ImportCard />
    </section>
  );
}

function ExportCard() {
  const [view, setView] = useState<ExportView>({ kind: "loading" });
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Re-read GET /me/export (used by the poll, the retry, and post-action
  // reconciliation) by re-triggering the load effect below.
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  // Status load (initial + every reload).
  useEffect(() => {
    const controller = new AbortController();
    authApi
      .getAccountExport(controller.signal)
      .then((status) => setView({ kind: "status", status }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 404) {
          // No export was ever requested, or the expired archive was cleaned up.
          setView({ kind: "none" });
        } else {
          setView({ kind: "load-error" });
        }
      });
    return () => controller.abort();
  }, [reloadKey]);

  // Poll while the background job is still assembling the archive. Each
  // status change schedules exactly one follow-up read; unmount cancels it.
  useEffect(() => {
    if (view.kind !== "status") return;
    if (view.status.state !== "pending" && view.status.state !== "running") return;
    const t = setTimeout(reload, EXPORT_POLL_MS);
    return () => clearTimeout(t);
  }, [view, reload]);

  async function requestExport() {
    setActionError(null);
    setBusy(true);
    try {
      const status = await authApi.requestAccountExport();
      setView({ kind: "status", status });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // One export may be active per account — show the one in progress.
        reload();
      } else {
        setActionError(
          err instanceof ApiError ? err.message : "Could not request the export. Please try again.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    setActionError(null);
    setBusy(true);
    try {
      const archive = await authApi.downloadAccountExport();
      downloadJsonFile("vidra-account-export.json", archive);
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) {
        setActionError("This export has expired — request a new one.");
        setView({ kind: "none" });
      } else if (err instanceof ApiError && (err.status === 409 || err.status === 404)) {
        // Not ready after all (or gone) — re-read the honest state.
        setActionError("The export is not ready to download.");
        reload();
      } else {
        setActionError(
          err instanceof ApiError ? err.message : "Could not download the archive. Please try again.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  const status = view.kind === "status" ? view.status : null;
  const preparing = status !== null && (status.state === "pending" || status.state === "running");
  const ready = status !== null && status.state === "done" && status.download_ready;
  const failed = status !== null && status.state === "failed";
  // done but no longer downloadable = expired archive; offer a fresh request.
  const expired = status !== null && status.state === "done" && !status.download_ready;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Export your data</h3>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Download one JSON archive of your profile, channels, video details (including tags and
          categories), playlists, comments, follows, saved videos, watch history, and notification
          preferences. It never contains your password or sign-in tokens, and media files are not
          bundled — each video entry carries a link to download its original file instead. A
          finished export stays downloadable for 7 days.
        </p>
      </div>

      {actionError ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
        >
          {actionError}
        </p>
      ) : null}

      {view.kind === "loading" ? (
        <div className="flex justify-center py-2">
          <Spinner label="Loading export status" />
        </div>
      ) : view.kind === "load-error" ? (
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            Could not load your export status.
          </p>
          <button
            type="button"
            onClick={() => {
              setView({ kind: "loading" });
              reload();
            }}
            className="self-start rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Retry
          </button>
        </div>
      ) : preparing ? (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-300">
          Preparing your export… This runs in the background; the download appears here when the
          archive is ready.
        </p>
      ) : ready ? (
        <div className="flex flex-col gap-2">
          <p role="status" className="text-sm text-green-700 dark:text-green-300">
            Your export is ready.
            {status?.expires_at
              ? ` Downloadable until ${new Date(status.expires_at).toLocaleDateString()}.`
              : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void download()}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {busy ? "Downloading…" : "Download archive"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void requestExport()}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Request a new export
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {failed ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              Your last export failed. You can request a new one.
            </p>
          ) : expired ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Your previous export expired. Request a new one to download your data.
            </p>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void requestExport()}
            className="self-start rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {busy ? "Requesting…" : "Request export"}
          </button>
        </div>
      )}
    </div>
  );
}

function ImportCard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<AccountImportSummary | null>(null);

  async function submit() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setError(null);
    setSummary(null);

    // Parse client-side first: a non-JSON file (or JSON that is plainly not a
    // vidra archive) gets an honest message without a round trip. Anything
    // structurally archive-shaped is sent — the backend is the validator.
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setError("That file is not valid JSON — choose the archive the export produced.");
      return;
    }
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("vidra_export" in parsed) ||
      !("profile" in parsed)
    ) {
      setError("That file is not a vidra account archive.");
      return;
    }

    setBusy(true);
    try {
      setSummary(await authApi.importAccountArchive(parsed as AccountArchive));
      setFileName(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      if (err instanceof ApiError && err.status === 413) {
        setError("The archive is larger than this instance accepts.");
      } else if (err instanceof ApiError && err.status === 422) {
        setError("That file is not a valid vidra account archive.");
      } else {
        setError(err instanceof ApiError ? err.message : "The import failed. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Import an archive
        </h3>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Re-creates the safe parts of a vidra export archive on this account: profile name and
          bio, playlists (items whose videos exist on this instance), follows of local channels,
          and notification preferences. Channels, videos, comments, saved videos, and watch
          history are in the archive but cannot be re-imported. Importing never deletes anything;
          importing the same archive twice creates duplicate playlists.
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
        >
          {error}
        </p>
      ) : null}

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="flex flex-col gap-2"
      >
        <label htmlFor="import-archive-file" className="text-sm font-medium">
          Archive file (JSON)
        </label>
        <input
          ref={fileRef}
          id="import-archive-file"
          name="import-archive-file"
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            setFileName(e.target.files?.[0]?.name ?? null);
            setError(null);
            setSummary(null);
          }}
          className="text-sm text-zinc-600 file:mr-3 file:rounded-md file:border file:border-zinc-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-700 hover:file:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:text-zinc-300 dark:file:border-zinc-700 dark:file:bg-zinc-900 dark:file:text-zinc-200"
        />
        <button
          type="submit"
          disabled={busy || !fileName}
          className="self-start rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {busy ? "Importing…" : "Import archive"}
        </button>
      </form>

      {summary ? <ImportSummaryView summary={summary} /> : null}
    </div>
  );
}

function ImportSummaryView({ summary }: { summary: AccountImportSummary }) {
  const skipped = Object.entries(summary.skipped_sections).filter(([, count]) => count > 0);
  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-zinc-700 dark:border-green-900/50 dark:bg-green-950/20 dark:text-zinc-200"
    >
      <p className="font-medium text-green-800 dark:text-green-300">Import finished.</p>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        <li>Profile: {summary.profile_applied ? "display name and bio applied" : "not changed"}</li>
        <li>
          Playlists: {summary.playlists_created} created, {summary.playlist_items_added} items
          added
          {summary.playlist_items_skipped > 0
            ? `, ${summary.playlist_items_skipped} items skipped (video not on this instance)`
            : ""}
        </li>
        <li>
          Follows: {summary.follows_created} created
          {summary.follows_skipped > 0
            ? `, ${summary.follows_skipped} skipped (channel not on this instance)`
            : ""}
        </li>
        <li>
          Notification preferences: {summary.notification_prefs_applied} applied
          {summary.notification_prefs_skipped > 0
            ? `, ${summary.notification_prefs_skipped} skipped (unknown type)`
            : ""}
        </li>
      </ul>
      {skipped.length > 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Not importable from an archive:{" "}
          {skipped
            .map(([section, count]) => `${SKIPPED_SECTION_LABELS[section] ?? section} (${count})`)
            .join(", ")}
          .
        </p>
      ) : null}
    </div>
  );
}

// downloadJsonFile hands the archive to the browser's download pipeline via a
// short-lived object URL — the JSON never touches our server or storage.
function downloadJsonFile(filename: string, data: unknown): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
