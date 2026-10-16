"use client";

import { useState } from "react";

import { useT } from "@/components/I18nProvider";
import { CheckIcon } from "@/components/icons";
import { Button, Input, Modal, Spinner } from "@/components/ui";
import { ListTail } from "@/components/ui/ListTail";
import { api, errorMessage, type Playlist } from "@/lib/api";
import { useAppendingList } from "@/lib/use-appending-list";

/** Playlist picker shared by the video-card menu and future controlled triggers. */
export function PlaylistPickerDialog({
  videoId,
  onClose,
}: {
  videoId: string;
  onClose: () => void;
}) {
  const t = useT();
  // Paged from the server so a user with more than 20 playlists can reach all
  // of them; the manual "Load more" button is enough inside a small dialog.
  const list = useAppendingList<Playlist>({
    queryKey: "my-playlists",
    getId: (p) => p.id,
    load: (window, signal) =>
      api.getMyPlaylists(signal, window).then((res) => ({ items: res.playlists, total: res.total })),
  });
  const playlists = list.status === "ready" ? list.items : null;
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function markAdded(id: string) {
    setAdded((current) => new Set(current).add(id));
  }

  async function add(playlistId: string) {
    if (busy) return;
    setBusy(playlistId);
    setError(null);
    try {
      await api.addToPlaylist(playlistId, videoId);
      markAdded(playlistId);
    } catch (err) {
      setError(errorMessage(err, t("playlists.picker.addError")));
    } finally {
      setBusy(null);
    }
  }

  async function createAndAdd(event: React.FormEvent) {
    event.preventDefault();
    const title = newTitle.trim();
    if (creating || title === "") return;
    setCreating(true);
    setError(null);
    try {
      const playlist = await api.createPlaylist({ title });
      await api.addToPlaylist(playlist.id, videoId);
      list.prepend(playlist);
      markAdded(playlist.id);
      setNewTitle("");
    } catch (err) {
      setError(errorMessage(err, t("playlists.picker.createError")));
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal title={t("playlists.picker.title")} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {list.status === "error" ? (
          <p role="alert" className="text-sm text-danger">{t("playlists.list.error")}</p>
        ) : playlists === null ? (
          <div className="flex justify-center py-8">
            <Spinner label={t("playlists.list.loading")} />
          </div>
        ) : playlists && playlists.length > 0 ? (
          <ul className="max-h-64 overflow-y-auto rounded-xl border border-border-subtle p-1">
            {playlists.map((playlist) => (
              <li key={playlist.id}>
                <button
                  type="button"
                  onClick={() => void add(playlist.id)}
                  disabled={busy === playlist.id}
                  aria-pressed={added.has(playlist.id)}
                  className="focus-ring flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-fg transition-colors hover:bg-surface-muted disabled:opacity-60"
                >
                  <span aria-hidden className="flex w-4 justify-center text-success">
                    {added.has(playlist.id) ? <CheckIcon size={16} /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{playlist.title}</span>
                  {added.has(playlist.id) ? (
                    <span className="text-xs font-medium text-fg-muted">{t("playlists.picker.added")}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : playlists ? (
          <p className="rounded-xl bg-surface-muted px-3 py-3 text-sm text-fg-muted">
            {t("playlists.picker.empty")}
          </p>
        ) : null}

        <ListTail
          hasMore={list.hasMore}
          autoLoad={false}
          busy={list.moreStatus === "loading"}
          error={list.moreStatus === "error" ? t("playlists.list.moreError") : null}
          onLoadMore={list.loadMore}
        />

        <form onSubmit={(event) => void createAndAdd(event)} className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Input
              label={t("playlists.picker.newLabel")}
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              placeholder={t("playlists.picker.newPlaceholder")}
              maxLength={200}
            />
          </div>
          <Button type="submit" size="sm" disabled={creating || newTitle.trim() === ""}>
            {creating ? t("playlists.picker.creating") : t("playlists.create.submit")}
          </Button>
        </form>

        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      </div>
    </Modal>
  );
}
