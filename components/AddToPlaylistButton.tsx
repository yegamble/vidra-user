"use client";

import Link from "next/link";
import { useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { CheckIcon, PlusIcon } from "@/components/icons";
import { api } from "@/lib/api";
import type { Playlist } from "@/lib/api";

// AddToPlaylistButton lets a signed-in viewer add the current video to one of
// their playlists (or a new one) from the watch page. The playlist list loads
// the first time the menu opens.
export function AddToPlaylistButton({ videoId }: { videoId: string }) {
  const { status } = useSession();
  const [open, setOpen] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null); // null = not loaded
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  if (status !== "authed") {
    return (
      <Link
        href="/login"
        className="focus-ring inline-flex shrink-0 items-center whitespace-nowrap rounded-[10px] bg-surface-muted px-4 py-2 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-strong"
      >
        Sign in to save to a playlist
      </Link>
    );
  }

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && playlists === null) {
      try {
        const res = await api.getMyPlaylists();
        setPlaylists(res.playlists);
      } catch {
        setPlaylists([]);
      }
    }
  }

  function markAdded(plId: string) {
    setAdded((s) => {
      const next = new Set(s);
      next.add(plId);
      return next;
    });
  }

  async function add(plId: string) {
    if (busy) return;
    setBusy(plId);
    try {
      await api.addToPlaylist(plId, videoId);
      markAdded(plId);
    } catch {
      // Leave unchanged on failure.
    } finally {
      setBusy(null);
    }
  }

  async function createAndAdd(e: React.FormEvent) {
    e.preventDefault();
    const t = newTitle.trim();
    if (creating || t === "") return;
    setCreating(true);
    try {
      const pl = await api.createPlaylist({ title: t });
      await api.addToPlaylist(pl.id, videoId);
      setPlaylists((list) => [pl, ...(list ?? [])]);
      markAdded(pl.id);
      setNewTitle("");
    } catch {
      // Leave unchanged on failure.
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => void toggle()}
        className="focus-ring flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] bg-surface-muted px-4 py-2 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-strong"
      >
        <PlusIcon size={16} />
        <span>Save to playlist</span>
      </button>
      {open ? (
        <div className="absolute left-0 z-20 mt-2 w-64 rounded-xl border border-border-subtle bg-surface-raised p-2 shadow-soft-strong">
          {playlists === null ? (
            <p className="px-2 py-1.5 text-sm text-fg-muted">Loading…</p>
          ) : playlists.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-fg-muted">No playlists yet — create one below.</p>
          ) : (
            <ul className="max-h-56 overflow-auto">
              {playlists.map((pl) => (
                <li key={pl.id}>
                  <button
                    type="button"
                    onClick={() => void add(pl.id)}
                    disabled={busy === pl.id}
                    aria-pressed={added.has(pl.id)}
                    className="focus-ring flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-fg transition-colors hover:bg-surface-muted disabled:opacity-60"
                  >
                    <span aria-hidden className="flex w-4 justify-center">
                      {added.has(pl.id) ? <CheckIcon size={16} /> : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{pl.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            onSubmit={(e) => void createAndAdd(e)}
            className="mt-2 flex items-center gap-2 border-t border-border-subtle pt-2"
          >
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="New playlist"
              aria-label="New playlist name"
              maxLength={200}
              className="focus-ring min-w-0 flex-1 rounded-xl border border-border bg-surface px-2.5 py-1.5 text-sm text-fg placeholder:text-fg-muted"
            />
            <button
              type="submit"
              disabled={creating || newTitle.trim() === ""}
              className="focus-ring shrink-0 rounded-[10px] bg-accent px-3 py-1.5 text-[13px] font-semibold text-accent-fg transition-colors hover:bg-accent/90 disabled:opacity-50"
            >
              Create
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
