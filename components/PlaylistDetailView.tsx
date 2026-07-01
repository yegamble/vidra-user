"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { VideoCard } from "@/components/VideoCard";
import { ApiError, api } from "@/lib/api";
import type { PlaylistDetail, PlaylistVisibility } from "@/lib/api";

type Status = "loading" | "error" | "notfound" | "ready";

// PlaylistDetailView shows a playlist and its videos. Owner-only controls (remove
// item, delete playlist) appear when the playlist is one of the viewer's own.
export function PlaylistDetailView({ id }: { id: string }) {
  const router = useRouter();
  const { status: session } = useSession();
  const [status, setStatus] = useState<Status>("loading");
  const [playlist, setPlaylist] = useState<PlaylistDetail | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getPlaylist(id, controller.signal)
      .then((p) => {
        setPlaylist(p);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setStatus(err instanceof ApiError && err.status === 404 ? "notfound" : "error");
      });
    return () => controller.abort();
  }, [id, reloadKey]);

  useEffect(() => {
    if (session !== "authed") return;
    const controller = new AbortController();
    api
      .getMyPlaylists(controller.signal)
      .then((res) => setIsOwner(res.playlists.some((p) => p.id === id)))
      .catch(() => {
        // Ownership is best-effort; without it the controls just stay hidden.
      });
    return () => controller.abort();
  }, [session, id]);

  function retry() {
    setStatus("loading");
    setReloadKey((k) => k + 1);
  }

  async function removeItem(videoId: string) {
    if (!playlist) return;
    const prev = playlist;
    setPlaylist({
      ...playlist,
      videos: playlist.videos.filter((v) => v.id !== videoId),
      video_count: Math.max(0, playlist.video_count - 1),
    });
    try {
      await api.removeFromPlaylist(id, videoId);
    } catch {
      setPlaylist(prev); // restore on failure
    }
  }

  async function deletePlaylist() {
    try {
      await api.deletePlaylist(id);
      router.push("/playlists");
    } catch {
      // Leave the page as-is on failure.
    }
  }

  if (status === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Spinner label="Loading playlist" />
      </div>
    );
  }
  if (status === "notfound") {
    return (
      <EmptyState
        title="Playlist not found"
        message="This playlist does not exist, or it is private."
      />
    );
  }
  if (status === "error" || playlist === null) {
    return <ErrorState message="Could not load this playlist." onRetry={retry} />;
  }

  return (
    <div className="flex flex-col gap-6">
      {isOwner && editing ? (
        <EditPlaylistForm
          playlist={playlist}
          onSaved={() => {
            setEditing(false);
            retry();
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <header className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{playlist.title}</h1>
            {isOwner ? (
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void deletePlaylist()}
                  className="rounded-full border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  Delete playlist
                </button>
              </div>
            ) : null}
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {playlist.video_count} {playlist.video_count === 1 ? "video" : "videos"} · {playlist.visibility}
          </p>
          {playlist.description ? (
            <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
              {playlist.description}
            </p>
          ) : null}
        </header>
      )}

      {playlist.videos.length === 0 ? (
        <EmptyState
          title="This playlist is empty"
          message="Add videos to it from any watch page with “Save to playlist”."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {playlist.videos.map((video) => (
            <li key={video.id} className="flex flex-col gap-2">
              <VideoCard video={video} />
              {isOwner ? (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => void removeItem(video.id)}
                    aria-label={`Remove ${video.title} from playlist`}
                    className="text-xs font-medium text-zinc-500 hover:text-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:hover:text-zinc-200"
                  >
                    Remove
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// EditPlaylistForm is the owner-only inline editor for a playlist's title,
// description, and visibility. On save it PATCHes the playlist and the parent
// refetches; a blank title is blocked before submit.
function EditPlaylistForm({
  playlist,
  onSaved,
  onCancel,
}: {
  playlist: PlaylistDetail;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(playlist.title);
  const [description, setDescription] = useState(playlist.description);
  const [visibility, setVisibility] = useState<PlaylistVisibility>(playlist.visibility);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const trimmed = title.trim();
    if (trimmed === "" || saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.updatePlaylist(playlist.id, {
        title: trimmed,
        description: description.trim(),
        visibility,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the playlist.");
      setSaving(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h2 className="text-base font-semibold tracking-tight">Edit playlist</h2>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Title</span>
        <input
          aria-label="Playlist title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Description</span>
        <textarea
          aria-label="Playlist description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={5000}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Visibility</span>
        <select
          aria-label="Playlist visibility"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as PlaylistVisibility)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <option value="private">Private</option>
          <option value="unlisted">Unlisted</option>
          <option value="public">Public</option>
        </select>
      </label>
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || title.trim() === ""}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
