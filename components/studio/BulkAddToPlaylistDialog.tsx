"use client";

import { useState } from "react";

import { CheckIcon } from "@/components/icons";
import { Alert, Button, Modal, Spinner } from "@/components/ui";
import { ListTail } from "@/components/ui/ListTail";
import { api, errorMessage, type Playlist } from "@/lib/api";
import { useAppendingList } from "@/lib/use-appending-list";

export type BulkVideoRef = { id: string; title: string };

/**
 * BulkAddToPlaylistDialog adds the selected studio videos to ONE playlist by
 * calling the existing per-video add endpoint (POST /playlists/{id}/videos,
 * idempotent) once per video. There is no bulk playlist endpoint, so the loop
 * runs here, sequentially: it shows progress, never stops at the first failure,
 * and finishes with a per-item failure summary instead of a single vague error.
 */
export function BulkAddToPlaylistDialog({
  videos,
  onClose,
  onDone,
}: {
  videos: BulkVideoRef[];
  onClose: () => void;
  /** Called with the ids that were added, once the run has finished. */
  onDone?: (addedIds: string[]) => void;
}) {
  const list = useAppendingList<Playlist>({
    queryKey: "my-playlists",
    getId: (p) => p.id,
    load: (window, signal) =>
      api.getMyPlaylists(signal, window).then((res) => ({ items: res.playlists, total: res.total })),
  });
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{
    playlist: string;
    added: number;
    failures: { id: string; title: string; error: string }[];
  } | null>(null);

  async function run(playlist: Playlist) {
    if (progress) return;
    const failures: { id: string; title: string; error: string }[] = [];
    const added: string[] = [];
    setProgress({ done: 0, total: videos.length });
    for (const [i, v] of videos.entries()) {
      try {
        await api.addToPlaylist(playlist.id, v.id);
        added.push(v.id);
      } catch (err) {
        failures.push({ id: v.id, title: v.title, error: errorMessage(err, "Could not add.") });
      }
      setProgress({ done: i + 1, total: videos.length });
    }
    setResult({ playlist: playlist.title, added: added.length, failures });
    setProgress(null);
    onDone?.(added);
  }

  const noun = videos.length === 1 ? "video" : "videos";
  return (
    <Modal title={`Add ${videos.length} ${noun} to a playlist`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {result ? (
          <>
            <Alert variant={result.failures.length === 0 ? "success" : "warning"}>
              Added {result.added} of {videos.length} to {result.playlist}.
            </Alert>
            {result.failures.length > 0 ? (
              <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto text-sm" aria-label="Videos that could not be added">
                {result.failures.map((f) => (
                  <li key={f.id} className="rounded-lg bg-danger-surface px-3 py-2 text-danger">
                    <span className="font-medium">{f.title}</span>: {f.error}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex justify-end">
              <Button onClick={onClose}>Done</Button>
            </div>
          </>
        ) : progress ? (
          <div className="flex flex-col items-center gap-3 py-6" role="status">
            <Spinner label="Adding videos" />
            <p className="text-sm text-fg-muted">
              Adding {progress.done} of {progress.total}
            </p>
          </div>
        ) : list.status === "error" ? (
          <p role="alert" className="text-sm text-danger">Could not load your playlists.</p>
        ) : list.status === "loading" ? (
          <div className="flex justify-center py-8">
            <Spinner label="Loading your playlists" />
          </div>
        ) : list.items.length === 0 ? (
          <p className="rounded-xl bg-surface-muted px-3 py-3 text-sm text-fg-muted">
            You have no playlists yet. Create one from the Playlists page first.
          </p>
        ) : (
          <ul className="max-h-64 overflow-y-auto rounded-xl border border-border-subtle p-1">
            {list.items.map((playlist) => (
              <li key={playlist.id}>
                <button
                  type="button"
                  onClick={() => void run(playlist)}
                  className="focus-ring flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-fg transition-colors hover:bg-surface-muted"
                >
                  <span aria-hidden className="flex w-4 justify-center text-success">
                    <CheckIcon size={16} className="opacity-0" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{playlist.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {!result && !progress ? (
          <ListTail
            hasMore={list.hasMore}
            autoLoad={false}
            busy={list.moreStatus === "loading"}
            error={list.moreStatus === "error" ? "Could not load more playlists." : null}
            onLoadMore={list.loadMore}
          />
        ) : null}
      </div>
    </Modal>
  );
}
