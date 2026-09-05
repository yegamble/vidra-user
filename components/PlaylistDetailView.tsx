"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { PlaylistIcon } from "@/components/icons";
import { PlaylistThumbnailManager } from "@/components/PlaylistThumbnailManager";
import { Button, Input, Select, Textarea } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { VideoCard } from "@/components/VideoCard";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { PlaylistDetail, PlaylistVisibility } from "@/lib/api";
import { useApiResource } from "@/lib/use-api-resource";


// PlaylistDetailView shows a playlist and its videos. Owner-only controls (remove
// item, delete playlist) appear when the playlist is one of the viewer's own.
export function PlaylistDetailView({ id }: { id: string }) {
  const { status, user } = useSession();
  if (status === "restoring") return <Spinner label="Loading playlist" />;
  // Session changes also discard pending optimistic edits and editor state.
  return <PlaylistForViewer key={`${id}:${status}:${user?.id ?? ""}`} id={id} />;
}

function PlaylistForViewer({ id }: { id: string }) {
  const router = useRouter();
  const { status: session, user } = useSession();
  const { status, data: playlist, retry, setData: setPlaylist } = useApiResource<PlaylistDetail | null>(async (signal) => {
    if (signal.aborted || session === "restoring") return new Promise(() => {});
    try {
      return await api.getPlaylist(id, signal);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  }, [id, session, user?.id]);
  const { data: owned } = useApiResource<boolean>(async (signal) => {
    if (signal.aborted || session === "restoring") return new Promise(() => {});
    if (session !== "authed") return false;
    try {
      const res = await api.getMyPlaylists(signal);
      return res.playlists.some((p) => p.id === id);
    } catch {
      return false; // Preserve the owner-control guard when ownership cannot be read.
    }
  }, [id, session, user?.id]);
  const isOwner = owned === true;
  const [editing, setEditing] = useState(false);
  const [reordering, setReordering] = useState(false);

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

  // moveItem swaps the item at index with its neighbour in the given direction and
  // persists the whole new order via PUT (the backend expects the full item set).
  // Optimistic: the list reorders immediately and restores if the request fails
  // (e.g. a 422 if the visible items diverged from the stored set).
  async function moveItem(index: number, dir: -1 | 1) {
    if (!playlist || reordering) return;
    const target = index + dir;
    if (target < 0 || target >= playlist.videos.length) return;
    const prev = playlist;
    const reordered = [...playlist.videos];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setReordering(true);
    setPlaylist({ ...playlist, videos: reordered });
    try {
      await api.reorderPlaylist(
        id,
        reordered.map((v) => v.id),
      );
    } catch {
      setPlaylist(prev); // restore on failure
    } finally {
      setReordering(false);
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
  if (status === "ready" && playlist === null) {
    return (
      <EmptyState
        icon={<PlaylistIcon size={24} />}
        tint="gray"
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
            <h1 className="text-2xl font-bold tracking-tight">{playlist.title}</h1>
            {isOwner ? (
              <div className="flex shrink-0 gap-2">
                <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                  Edit
                </Button>
                <button
                  type="button"
                  onClick={() => void deletePlaylist()}
                  className="focus-ring rounded-full border border-danger-border px-3.5 py-1.5 text-[13px] font-semibold text-danger transition-colors hover:bg-danger-surface"
                >
                  Delete playlist
                </button>
              </div>
            ) : null}
          </div>
          <p className="text-[13px] text-fg-muted tabular-nums">
            {playlist.video_count} {playlist.video_count === 1 ? "video" : "videos"} · {playlist.visibility}
          </p>
          {playlist.description ? (
            <p className="whitespace-pre-wrap text-sm text-fg">
              {playlist.description}
            </p>
          ) : null}
        </header>
      )}

      {isOwner ? (
        <PlaylistThumbnailManager
          playlistId={playlist.id}
          hasThumbnail={playlist.has_thumbnail ?? false}
          onChanged={(has) => setPlaylist((p) => (p ? { ...p, has_thumbnail: has } : p))}
        />
      ) : null}

      {playlist.videos.length === 0 ? (
        <EmptyState
          icon={<PlaylistIcon size={24} />}
          title="This playlist is empty"
          message="Add videos to it from any watch page with “Save to playlist”."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {playlist.videos.map((video, index) => (
            <li key={video.id} className="flex flex-col gap-2">
              <VideoCard
                video={video}
                onDeleted={() =>
                  setPlaylist((p) =>
                    p ? { ...p, videos: p.videos.filter((v) => v.id !== video.id) } : p,
                  )
                }
              />
              {isOwner ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void moveItem(index, -1)}
                      disabled={reordering || index === 0}
                      aria-label={`Move ${video.title} up`}
                      className="focus-ring rounded-full px-2 py-1.5 text-[13px] font-semibold text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg disabled:opacity-40"
                    >
                      Move up
                    </button>
                    <button
                      type="button"
                      onClick={() => void moveItem(index, 1)}
                      disabled={reordering || index === playlist.videos.length - 1}
                      aria-label={`Move ${video.title} down`}
                      className="focus-ring rounded-full px-2 py-1.5 text-[13px] font-semibold text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg disabled:opacity-40"
                    >
                      Move down
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => void removeItem(video.id)}
                    aria-label={`Remove ${video.title} from playlist`}
                    className="focus-ring rounded-full px-2 py-1.5 text-[13px] font-semibold text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
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
      setError(errorMessage(err, "Could not save the playlist."));
      setSaving(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h2 className="text-[15px] font-bold tracking-tight">Edit playlist</h2>
      <Input
        label="Title"
        aria-label="Playlist title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
      />
      <Textarea
        label="Description"
        aria-label="Playlist description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        maxLength={5000}
      />
      <Select
        label="Visibility"
        aria-label="Playlist visibility"
        value={visibility}
        onChange={(e) => setVisibility(e.target.value as PlaylistVisibility)}
      >
        <option value="private">Private</option>
        <option value="unlisted">Unlisted</option>
        <option value="public">Public</option>
      </Select>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving || title.trim() === ""}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
