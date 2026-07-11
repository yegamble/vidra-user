"use client";

import { useEffect, useState } from "react";

import { CheckIcon } from "@/components/icons";
import { Button, Input, Modal, Spinner } from "@/components/ui";
import { api, errorMessage, type Playlist } from "@/lib/api";

/** Playlist picker shared by the video-card menu and future controlled triggers. */
export function PlaylistPickerDialog({
  videoId,
  onClose,
}: {
  videoId: string;
  onClose: () => void;
}) {
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getMyPlaylists(controller.signal)
      .then((res) => setPlaylists(res.playlists))
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(err, "Could not load your playlists."));
      });
    return () => controller.abort();
  }, []);

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
      setError(errorMessage(err, "Could not add this video to the playlist."));
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
      setPlaylists((current) => [playlist, ...(current ?? [])]);
      markAdded(playlist.id);
      setNewTitle("");
    } catch (err) {
      setError(errorMessage(err, "Could not create the playlist."));
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal title="Save to playlist" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {playlists === null && !error ? (
          <div className="flex justify-center py-8">
            <Spinner label="Loading your playlists" />
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
                    <span className="text-xs font-medium text-fg-muted">Added</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : playlists ? (
          <p className="rounded-xl bg-surface-muted px-3 py-3 text-sm text-fg-muted">
            No playlists yet. Create one below.
          </p>
        ) : null}

        <form onSubmit={(event) => void createAndAdd(event)} className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Input
              label="New playlist"
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              placeholder="Playlist name"
              maxLength={200}
            />
          </div>
          <Button type="submit" size="sm" disabled={creating || newTitle.trim() === ""}>
            {creating ? "Creating…" : "Create"}
          </Button>
        </form>

        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      </div>
    </Modal>
  );
}
