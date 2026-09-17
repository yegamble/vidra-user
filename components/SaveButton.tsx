"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { useWatchSignIn } from "@/components/watch/WatchSignInPrompt";
import { CheckIcon, PlusIcon } from "@/components/icons";
import { api } from "@/lib/api";
import { FULL_LIST_LIMIT } from "@/lib/api/pagination";

// SaveButton toggles a video in the signed-in viewer's library ("watch later").
// On mount it reads the library to reflect whether this video is already saved;
// clicking saves or unsaves, with the server treated as the source of truth.
export function SaveButton({ videoId }: { videoId: string }) {
  const { status } = useSession();
  const requestSignIn = useWatchSignIn();
  const watchSize = requestSignIn ? "w-11 justify-center px-0 @min-[340px]/watch-actions:w-auto @min-[340px]/watch-actions:px-3" : "px-4";
  const labelClass = requestSignIn ? "sr-only @min-[340px]/watch-actions:not-sr-only" : undefined;
  const [saved, setSaved] = useState<boolean | null>(null); // null = not yet known
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status !== "authed") return;
    const controller = new AbortController();
    api
      .getSavedVideos({ limit: FULL_LIST_LIMIT }, controller.signal)
      .then((res) => setSaved(res.videos.some((v) => v.id === videoId)))
      .catch(() => {
        if (!controller.signal.aborted) setSaved(false);
      });
    return () => controller.abort();
  }, [videoId, status]);

  if (status !== "authed") {
    if (requestSignIn) return <button type="button" disabled={status === "restoring"}
      onClick={() => requestSignIn("save this video")} title="Save"
      className={"focus-ring inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-surface-muted text-[13px] font-semibold text-fg hover:bg-surface-strong " + watchSize}>
      <PlusIcon size={16} /><span className={labelClass}>Save</span>
    </button>;
    return (
      <Link
        href="/login"
        className="focus-ring inline-flex shrink-0 items-center whitespace-nowrap rounded-[10px] bg-surface-muted px-4 py-2 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-strong"
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
      title={requestSignIn ? (saved ? "Saved" : "Save") : undefined}
      disabled={busy || saved === null}
      onClick={() => void toggle()}
      className={
        "focus-ring flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full py-2 text-[13px] font-semibold transition-colors disabled:opacity-60 " +
        watchSize + " " + (saved
          ? "bg-accent text-accent-fg hover:bg-accent/90"
          : "bg-surface-muted text-fg hover:bg-surface-strong")
      }
    >
      {saved ? <CheckIcon size={16} /> : <PlusIcon size={16} />}
      <span className={labelClass}>{saved ? "Saved" : "Save"}</span>
    </button>
  );
}
