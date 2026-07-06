"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { PlaylistCard } from "@/components/PlaylistCard";
import { Button, Input, Select } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/api";
import type { Playlist, PlaylistVisibility } from "@/lib/api";

type Status = "loading" | "error" | "ready";

// PlaylistsView lists the signed-in user's playlists and offers an inline create
// form. The session lives in memory, so a hard reload lands here signed out.
export function PlaylistsView() {
  const { status } = useSession();

  if (status !== "authed") {
    return (
      <EmptyState
        title="Sign in to see your playlists"
        message={
          <>
            <Link
              href="/login"
              className="focus-ring rounded font-semibold text-fg underline underline-offset-2 transition-colors hover:text-fg-muted"
            >
              Sign in
            </Link>{" "}
            to create playlists and organise videos.
          </>
        }
      />
    );
  }

  return <Playlists />;
}

function Playlists() {
  const [status, setStatus] = useState<Status>("loading");
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<PlaylistVisibility>("private");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getMyPlaylists(controller.signal)
      .then((res) => {
        setPlaylists(res.playlists);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [reloadKey]);

  function retry() {
    setStatus("loading");
    setReloadKey((k) => k + 1);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (creating || t === "") return;
    setCreating(true);
    setCreateError(null);
    try {
      const pl = await api.createPlaylist({ title: t, visibility });
      setPlaylists((list) => [pl, ...list]);
      setTitle("");
      setVisibility("private");
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
    return <ErrorState message="Could not load your playlists." onRetry={retry} />;
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
        <Button type="submit" disabled={creating || title.trim() === ""}>
          Create
        </Button>
      </form>
      {createError ? <p className="text-sm text-danger">{createError}</p> : null}

      {playlists.length === 0 ? (
        <EmptyState
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
    </div>
  );
}
