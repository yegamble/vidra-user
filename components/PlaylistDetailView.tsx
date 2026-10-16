"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { useT } from "@/components/I18nProvider";
import { PlayIcon, PlaylistIcon } from "@/components/icons";
import { PlaylistChannelSelect } from "@/components/PlaylistChannelSelect";
import { PlaylistThumbnailManager } from "@/components/PlaylistThumbnailManager";
import { Button, Input, Select, Textarea } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ListTail } from "@/components/ui/ListTail";
import { PAGE_SIZE } from "@/components/ui/LoadMoreButton";
import { Spinner } from "@/components/ui/Spinner";
import { UserText } from "@/components/UserText";
import { VideoCard } from "@/components/VideoCard";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { PlaylistDetail, PlaylistVisibility } from "@/lib/api";
import { playlistWatchHref } from "@/lib/playlist-queue";
import { useApiResource } from "@/lib/use-api-resource";
import { useAppendingList } from "@/lib/use-appending-list";
import { useBrowseAutoLoad } from "@/lib/use-browse-auto-load";

type PlaylistVideo = PlaylistDetail["videos"][number];

// PlaylistDetailView shows a playlist and its videos, paged. Owner-only controls
// (reorder, remove item, edit, delete playlist) appear when the playlist's
// owner_id is the signed-in user.
export function PlaylistDetailView({ id }: { id: string }) {
  const t = useT();
  const { status, user } = useSession();
  if (status === "restoring") return <Spinner label={t("playlists.detail.loading")} />;
  // Session changes also discard pending optimistic edits and editor state.
  return <PlaylistForViewer key={`${id}:${status}:${user?.id ?? ""}`} id={id} />;
}

function PlaylistForViewer({ id }: { id: string }) {
  const t = useT();
  const router = useRouter();
  const { status: session, user } = useSession();
  // The playlist plus its FIRST page of items; later pages are PlaylistItems'.
  const { status, data: playlist, retry, setData: setPlaylist } = useApiResource<PlaylistDetail | null>(async (signal) => {
    if (signal.aborted || session === "restoring") return new Promise(() => {});
    try {
      return await api.getPlaylist(id, { limit: PAGE_SIZE, offset: 0 }, signal);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  }, [id, session, user?.id]);
  // From the playlist itself: searching GET /me/playlists only ever saw its
  // first page, so an owner of more than 20 playlists lost these controls.
  const isOwner = session === "authed" && user != null && playlist?.owner_id === user.id;
  const [editing, setEditing] = useState(false);
  // Deleting a playlist is irreversible and the control sits inches from Edit.
  // Two-step, the same shape the Studio video row uses — one destructive idiom,
  // not three (A11 close-out).
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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
        <Spinner label={t("playlists.detail.loading")} />
      </div>
    );
  }
  if (status === "ready" && playlist === null) {
    return (
      <EmptyState
        icon={<PlaylistIcon size={24} />}
        tint="gray"
        title={t("playlists.detail.notFound.title")}
        message={t("playlists.detail.notFound.message")}
      />
    );
  }
  if (status === "error" || playlist === null) {
    return <ErrorState message={t("playlists.detail.error")} onRetry={retry} />;
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
              <div className="flex shrink-0 items-center gap-2">
                {confirmingDelete ? (
                  <>
                    <span className="text-[13px] text-fg-muted">{t("playlists.detail.deleteConfirm")}</span>
                    <button
                      type="button"
                      onClick={() => void deletePlaylist()}
                      className="focus-ring rounded-full border border-danger-border px-3.5 py-1.5 text-[13px] font-semibold text-danger transition-colors hover:bg-danger-surface"
                    >
                      {t("playlists.detail.confirmDelete")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(false)}
                      className="focus-ring rounded-full px-3.5 py-1.5 text-[13px] font-semibold text-fg-muted transition-colors hover:bg-surface-strong hover:text-fg"
                    >
                      {t("playlists.detail.cancelDelete")}
                    </button>
                  </>
                ) : (
                  <>
                    <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                      {t("playlists.detail.edit")}
                    </Button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(true)}
                      className="focus-ring rounded-full border border-danger-border px-3.5 py-1.5 text-[13px] font-semibold text-danger transition-colors hover:bg-danger-surface"
                    >
                      {t("playlists.detail.delete")}
                    </button>
                  </>
                )}
              </div>
            ) : null}
          </div>
          {playlist.videos[0] ? (
            <Link
              href={playlistWatchHref(playlist.videos[0], playlist.id, 1)}
              className="focus-ring inline-flex w-fit items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-accent-fg transition-opacity hover:opacity-90"
            >
              <PlayIcon size={16} /> {t("playlists.detail.playAll")}
            </Link>
          ) : null}
          <p className="text-[13px] text-fg-muted tabular-nums">
            {t("playlists.detail.meta", {
              videos: t("playlists.card.videos", { count: String(playlist.video_count) }),
              visibility: playlist.visibility,
            })}
          </p>
          {playlist.description ? (
            <UserText variant="description" text={playlist.description} className="text-sm text-fg" />
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

      <PlaylistItems
        playlist={playlist}
        isOwner={isOwner}
        onCountChange={(delta) =>
          setPlaylist((p) => (p ? { ...p, video_count: Math.max(0, p.video_count + delta) } : p))
        }
      />
    </div>
  );
}

// placeAfter moves `id` to directly after `afterId`, or to the front when it is
// null — the rule POST /videos/{id}/move applies server-side.
function placeAfter(items: PlaylistVideo[], id: string, afterId: string | null): PlaylistVideo[] {
  const moved = items.find((v) => v.id === id);
  const rest = items.filter((v) => v.id !== id);
  const at = afterId === null ? 0 : rest.findIndex((v) => v.id === afterId) + 1;
  if (!moved || (afterId !== null && at === 0)) return items;
  return [...rest.slice(0, at), moved, ...rest.slice(at)];
}

// PlaylistItems pages the playlist's videos ("Load more"), seeded with the first
// page the header fetch already carried. A move sends only the moved video and
// its new predecessor, so it works on a playlist the client has partly loaded.
function PlaylistItems({
  playlist,
  isOwner,
  onCountChange,
}: {
  playlist: PlaylistDetail;
  isOwner: boolean;
  onCountChange: (delta: number) => void;
}) {
  const t = useT();
  const autoLoad = useBrowseAutoLoad();
  const list = useAppendingList<PlaylistVideo>({
    queryKey: `playlist:${playlist.id}`,
    getId: (v) => v.id,
    initialPage: { items: playlist.videos, total: playlist.total },
    load: (window, signal) =>
      api.getPlaylist(playlist.id, window, signal).then((res) => ({ items: res.videos, total: res.total })),
  });
  const { items } = list;
  const [reordering, setReordering] = useState(false);

  async function removeItem(videoId: string) {
    list.drop((v) => v.id !== videoId); // optimistic
    onCountChange(-1);
    try {
      await api.removeFromPlaylist(playlist.id, videoId);
    } catch {
      onCountChange(1);
      list.reload(); // re-read the truth rather than guess the page window back
    }
  }

  // Optimistic: the list reorders at once and the item goes back if the move fails.
  // A 409 means our copy is stale (an item was removed elsewhere): re-read it.
  async function moveItem(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (reordering || target < 0 || target >= items.length) return;
    const videoId = items[index].id;
    const anchor = dir === -1 ? (items[index - 2]?.id ?? null) : items[index + 1].id;
    const before = items[index - 1]?.id ?? null;
    setReordering(true);
    list.patch((cur) => placeAfter(cur, videoId, anchor));
    try {
      await api.movePlaylistItem(playlist.id, videoId, anchor);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) list.reload();
      else list.patch((cur) => placeAfter(cur, videoId, before));
    } finally {
      setReordering(false);
    }
  }

  if (list.status === "loading") {
    return (
      <div className="flex justify-center py-12">
        <Spinner label={t("playlists.detail.videosLoading")} />
      </div>
    );
  }
  if (list.status === "error") {
    return <ErrorState message={t("playlists.detail.videosError")} onRetry={list.reload} />;
  }
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<PlaylistIcon size={24} />}
        title={t("playlists.detail.empty.title")}
        message={t("playlists.detail.empty.message")}
      />
    );
  }
  return (
    <>
      <ul className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((video, index) => (
          <li key={video.id} className="flex flex-col gap-2">
            <VideoCard
              video={video}
              playlistId={playlist.id}
              onDeleted={() => list.drop((v) => v.id !== video.id)}
            />
            <Link
              href={playlistWatchHref(video, playlist.id, index + 1)}
              className="focus-ring inline-flex w-fit items-center gap-1 rounded-full px-2 py-1.5 text-[13px] font-semibold text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
              aria-label={t("playlists.detail.playItem", { title: video.title })}
            >
              <PlayIcon size={14} /> {t("playlists.detail.play")}
            </Link>
            {isOwner ? (
              <div className="flex items-center justify-between gap-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void moveItem(index, -1)}
                    disabled={reordering || index === 0}
                    aria-label={t("playlists.detail.moveUpItem", { title: video.title })}
                    className="focus-ring rounded-full px-2 py-1.5 text-[13px] font-semibold text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg disabled:opacity-40"
                  >
                    {t("playlists.detail.moveUp")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void moveItem(index, 1)}
                    disabled={reordering || index === items.length - 1}
                    aria-label={t("playlists.detail.moveDownItem", { title: video.title })}
                    className="focus-ring rounded-full px-2 py-1.5 text-[13px] font-semibold text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg disabled:opacity-40"
                  >
                    {t("playlists.detail.moveDown")}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => void removeItem(video.id)}
                  aria-label={t("playlists.detail.removeItem", { title: video.title })}
                  className="focus-ring rounded-full px-2 py-1.5 text-[13px] font-semibold text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
                >
                  {t("playlists.thumb.remove")}
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <ListTail
        hasMore={list.hasMore}
        autoLoad={autoLoad}
        busy={list.moreStatus === "loading"}
        error={list.moreStatus === "error" ? t("playlists.detail.moreError") : null}
        onLoadMore={list.loadMore}
      />
    </>
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
  const t = useT();
  const [title, setTitle] = useState(playlist.title);
  const [description, setDescription] = useState(playlist.description);
  const [visibility, setVisibility] = useState<PlaylistVisibility>(playlist.visibility);
  const [channelId, setChannelId] = useState(playlist.channel_id ?? "");
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
        // Sent only when changed: null detaches the playlist from its channel,
        // a value attaches it, absent leaves it alone.
        ...(channelId !== (playlist.channel_id ?? "") ? { channel_id: channelId || null } : {}),
      });
      onSaved();
    } catch (err) {
      setError(errorMessage(err, t("playlists.edit.error")));
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
      <h2 className="text-[15px] font-bold tracking-tight">{t("playlists.edit.heading")}</h2>
      <Input
        label={t("playlists.edit.title")}
        aria-label={t("playlists.create.ariaTitle")}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
      />
      <Textarea
        label={t("playlists.edit.description")}
        aria-label={t("playlists.edit.descriptionAria")}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        maxLength={5000}
      />
      <Select
        label={t("playlists.create.visibility")}
        aria-label={t("playlists.edit.visibilityAria")}
        value={visibility}
        onChange={(e) => setVisibility(e.target.value as PlaylistVisibility)}
      >
        <option value="private">{t("playlists.create.private")}</option>
        <option value="unlisted">{t("playlists.create.unlisted")}</option>
        <option value="public">{t("playlists.create.public")}</option>
      </Select>
      <PlaylistChannelSelect value={channelId} onChange={setChannelId} />
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" size="sm" disabled={saving || title.trim() === ""}>
          {saving ? t("playlists.edit.saving") : t("playlists.edit.save")}
        </Button>
      </div>
    </form>
  );
}
