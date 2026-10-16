"use client";

import { useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { PlaylistIcon } from "@/components/icons";
import { PlaylistCard } from "@/components/PlaylistCard";
import { PlaylistChannelSelect } from "@/components/PlaylistChannelSelect";
import { Button, Input, Select } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ListTail } from "@/components/ui/ListTail";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/api";
import type { Playlist, PlaylistVisibility } from "@/lib/api";
import { useAppendingList } from "@/lib/use-appending-list";
import { useBrowseAutoLoad } from "@/lib/use-browse-auto-load";
import { SignInGate } from "@/components/SignInGate";

// PlaylistsView lists the signed-in user's playlists and offers an inline create
// form. The session lives in memory, so a hard reload lands here signed out.
export function PlaylistsView() {
  const { status } = useSession();

  if (status !== "authed") {
    return (
      <SignInGate icon={<PlaylistIcon size={24} />} title="Sign in to see your playlists">
        to create playlists and organise videos.
      </SignInGate>
    );
  }

  return <Playlists />;
}

function Playlists() {
  const autoLoad = useBrowseAutoLoad();
  // Paged from the server: the list used to stop at the first 20 playlists.
  const list = useAppendingList<Playlist>({
    queryKey: "my-playlists",
    getId: (p) => p.id,
    load: (window, signal) =>
      api.getMyPlaylists(signal, window).then((res) => ({ items: res.playlists, total: res.total })),
  });
  const { status, items: playlists } = list;

  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<PlaylistVisibility>("private");
  const [channelId, setChannelId] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (creating || t === "") return;
    setCreating(true);
    setCreateError(null);
    try {
      const pl = await api.createPlaylist({ title: t, visibility, ...(channelId ? { channel_id: channelId } : {}) });
      list.prepend(pl);
      setTitle("");
      setVisibility("private");
      setChannelId("");
    } catch {
      setCreateError("Could not create the playlist.");
    } finally {
      setCreating(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Spinner label="Loading your playlists" />
      </div>
    );
  }
  if (status === "error") {
    return <ErrorState message="Could not load your playlists." onRetry={list.reload} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={(e) => void create(e)}
        className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface p-4 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <Input
            label="New playlist"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Playlist title"
            aria-label="Playlist title"
            maxLength={200}
          />
        </div>
        <Select
          label="Visibility"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as PlaylistVisibility)}
          aria-label="Visibility"
        >
          <option value="private">Private</option>
          <option value="unlisted">Unlisted</option>
          <option value="public">Public</option>
        </Select>
        <PlaylistChannelSelect value={channelId} onChange={setChannelId} />
        <Button type="submit" disabled={creating || title.trim() === ""}>
          Create
        </Button>
      </form>
      {createError ? <p className="text-sm text-danger">{createError}</p> : null}

      {playlists.length === 0 ? (
        <EmptyState
          icon={<PlaylistIcon size={24} />}
          title="No playlists yet"
          message="Create a playlist above, then add videos to it from any watch page."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {playlists.map((pl) => (
            <li key={pl.id}>
              <PlaylistCard playlist={pl} />
            </li>
          ))}
        </ul>
      )}
      <ListTail
        hasMore={list.hasMore}
        autoLoad={autoLoad}
        busy={list.moreStatus === "loading"}
        error={list.moreStatus === "error" ? "Could not load more playlists." : null}
        onLoadMore={list.loadMore}
      />
    </div>
  );
}
