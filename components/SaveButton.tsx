"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { api } from "@/lib/api";

// SaveButton toggles a video in the signed-in viewer's library ("watch later").
// On mount it reads the library to reflect whether this video is already saved;
// clicking saves or unsaves, with the server treated as the source of truth.
export function SaveButton({ videoId }: { videoId: string }) {
  const { status } = useSession();
  const [saved, setSaved] = useState<boolean | null>(null); // null = not yet known
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status !== "authed") return;
    const controller = new AbortController();
    api
      .getSavedVideos({ limit: 100 }, controller.signal)
      .then((res) => setSaved(res.videos.some((v) => v.id === videoId)))
      .catch(() => {
        if (!controller.signal.aborted) setSaved(false);
      });
    return () => controller.abort();
  }, [videoId, status]);

  if (status !== "authed") {
    return (
      <Link
        href="/login"
        className="focus-ring inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-surface-muted px-4 py-2 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-strong"
      >
        Sign in to save
      </Link>
    );
  }

  async function toggle() {
    if (busy || saved === null) return;
    setBusy(true);
    const next = !saved;
    try {
      if (next) {
        await api.saveVideo(videoId);
      } else {
        await api.unsaveVideo(videoId);
      }
      setSaved(next);
    } catch {
      // Keep the current state on failure.
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      aria-pressed={saved === true}
      disabled={busy || saved === null}
      onClick={() => void toggle()}
      className={
        "focus-ring flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-semibold transition-colors disabled:opacity-60 " +
        (saved
          ? "bg-accent text-accent-fg hover:bg-accent/90"
          : "bg-surface-muted text-fg hover:bg-surface-strong")
      }
    >
      <span aria-hidden>{saved ? "★" : "☆"}</span>
      <span>{saved ? "Saved" : "Save"}</span>
    </button>
  );
}
