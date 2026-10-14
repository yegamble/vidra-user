"use client";

import { useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { useT } from "@/components/I18nProvider";
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
  const t = useT();
  const { status } = useSession();

  if (status !== "authed") {
    return (
      <SignInGate icon={<PlaylistIcon size={24} />} title={t("playlists.signIn.title")}>
        {t("playlists.signIn.body")}
      </SignInGate>
    );
  }

  return <Playlists />;
}

function Playlists() {
  const t = useT();
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
    const name = title.trim();
    if (creating || name === "") return;
    setCreating(true);
    setCreateError(null);
    try {
      const pl = await api.createPlaylist({ title: name, visibility, ...(channelId ? { channel_id: channelId } : {}) });
      list.prepend(pl);
      setTitle("");
      setVisibility("private");
      setChannelId("");
    } catch {
      setCreateError(t("playlists.create.error"));
    } finally {
      setCreating(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Spinner label={t("playlists.list.loading")} />
      </div>
    );
  }
  if (status === "error") {
    return <ErrorState message={t("playlists.list.error")} onRetry={list.reload} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={(e) => void create(e)}
        className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface p-4 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <Input
            label={t("playlists.create.label")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("playlists.create.placeholder")}
            aria-label={t("playlists.create.ariaTitle")}
            maxLength={200}
          />
        </div>
        <Select
          label={t("playlists.create.visibility")}
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as PlaylistVisibility)}
          aria-label={t("playlists.create.visibility")}
        >
          <option value="private">{t("playlists.create.private")}</option>
          <option value="unlisted">{t("playlists.create.unlisted")}</option>
          <option value="public">{t("playlists.create.public")}</option>
        </Select>
        <PlaylistChannelSelect value={channelId} onChange={setChannelId} />
        <Button type="submit" disabled={creating || title.trim() === ""}>
          {t("playlists.create.submit")}
        </Button>
      </form>
      {createError ? <p className="text-sm text-danger">{createError}</p> : null}

      {playlists.length === 0 ? (
        <EmptyState
          icon={<PlaylistIcon size={24} />}
          title={t("playlists.list.empty.title")}
          message={t("playlists.list.empty.message")}
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
        error={list.moreStatus === "error" ? t("playlists.list.moreError") : null}
        onLoadMore={list.loadMore}
      />
    </div>
  );
}
