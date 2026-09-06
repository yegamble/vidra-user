"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { remoteVideoThumbnailUrl, videoThumbnailUrl, type Video } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  END_CARD_COUNTDOWN_SECONDS,
  countdownAnnouncement,
  nextVideoHref,
} from "@/lib/end-card";

// EndCard is the end-of-playback overlay (PLAY-08) shown when the <video> fires
// `ended`. It lives in the player's media-overlay zone, so — per the documented
// design-system exception — it is white-on-scrim (no theme tokens; it sits on the
// video, not a surface). Two shapes:
//
//   • a NEXT video (the first related entry): its thumbnail + title + channel, an
//     8s countdown (default) with Play now / Cancel, and an "Autoplay next"
//     switch. The countdown auto-advances only while autoplay is on, the viewer
//     has not cancelled, AND the tab is visible — it pauses while the tab is
//     hidden, so a backgrounded tab is never yanked to a new video. Play now (or
//     the countdown hitting zero) navigates client-side to the next video.
//   • NO next video: a plain Replay affordance, no countdown.
//
// A11y: focus moves to Play now (or Replay) on show; the countdown is announced
// through a polite live region; Escape cancels a running countdown, then dismisses
// the card; the shell restores focus to the player controls on dismiss.
export function EndCard({
  nextVideo,
  nextHref,
  autoplayEnabled,
  onToggleAutoplay,
  onReplay,
  onDismiss,
}: {
  nextVideo: Video | null;
  nextHref?: string;
  /** The effective autoplay-next preference (session store); gates the countdown. */
  autoplayEnabled: boolean;
  onToggleAutoplay: () => void;
  /** Replay the finished video from the start (the shell owns the media element). */
  onReplay: () => void;
  /** Dismiss the card without replaying (returns focus to the player). */
  onDismiss: () => void;
}) {
  const router = useRouter();
  const playNowRef = useRef<HTMLButtonElement | null>(null);
  const replayRef = useRef<HTMLButtonElement | null>(null);
  // A hard Cancel (button or first Escape) stops the countdown for good — even if
  // autoplay stays on — and keeps the card until it is dismissed.
  const [cancelled, setCancelled] = useState(false);
  const [remaining, setRemaining] = useState(END_CARD_COUNTDOWN_SECONDS);

  const counting = nextVideo !== null && autoplayEnabled && !cancelled;

  const goNext = useCallback(() => {
    if (nextVideo) router.push(nextHref ?? nextVideoHref(nextVideo));
  }, [nextVideo, nextHref, router]);

  // Reset the countdown to the top exactly when it (re)starts — the React-endorsed
  // "adjust state during render" pattern (guarded so it converges), so there is no
  // reset effect and no cascading-render lint.
  const [wasCounting, setWasCounting] = useState(counting);
  if (counting !== wasCounting) {
    setWasCounting(counting);
    if (counting) setRemaining(END_CARD_COUNTDOWN_SECONDS);
  }

  // Focus the primary action on show (Play now when there is a next video, else
  // Replay), so a keyboard/AT user lands on it immediately.
  useEffect(() => {
    (nextVideo ? playNowRef.current : replayRef.current)?.focus();
  }, [nextVideo]);

  // Tick down once a second WHILE the tab is visible; a hidden tab pauses the
  // countdown (never navigates a backgrounded tab). Because the tick is skipped
  // while hidden, `remaining` can only reach 0 during a visible tick.
  useEffect(() => {
    if (!counting) return;
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      setRemaining((r) => (r > 0 ? r - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [counting]);

  // Navigate exactly once, when a running countdown reaches zero (a pure side
  // effect synchronized to state — no setState here, so it never navigates a
  // hidden tab, since the tick that produces 0 only runs while visible).
  useEffect(() => {
    if (counting && remaining === 0) goNext();
  }, [counting, remaining, goNext]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    // First Escape cancels a running countdown; a second (or Escape with no
    // countdown) dismisses the card.
    if (counting) setCancelled(true);
    else onDismiss();
  }

  const thumbUrl =
    nextVideo && nextVideo.has_thumbnail
      ? nextVideo.remote === true
        ? remoteVideoThumbnailUrl(nextVideo.id)
        : videoThumbnailUrl(nextVideo.id)
      : null;

  return (
    <div
      data-testid="player-end-card"
      role="group"
      aria-label={nextVideo ? "Up next" : "Playback finished"}
      onKeyDown={onKeyDown}
      className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/80 px-4 py-6 text-center text-white backdrop-blur-sm"
    >
      {/* Polite live region for the countdown — visually hidden so the visible
          number (below, aria-hidden) is not read twice. */}
      <span className="sr-only" role="status" aria-live="polite">
        {counting ? countdownAnnouncement(remaining) : ""}
      </span>

      {nextVideo ? (
        <>
          <div className="flex flex-col items-center gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">
              Up next
            </span>
            <div className="flex max-w-md items-center gap-3 text-left">
              <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-lg bg-white/10 sm:w-40">
                {thumbUrl ? (
                  // Backend-served thumbnail; a plain <img> avoids next/image config.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[11px] text-white/50">
                    No preview
                  </span>
                )}
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <p className="line-clamp-2 text-sm font-semibold leading-snug text-white">
                  {nextVideo.title}
                </p>
                {nextVideo.channel_display_name || nextVideo.channel_handle ? (
                  <p className="truncate text-xs text-white/70">
                    {nextVideo.channel_display_name || nextVideo.channel_handle}
                  </p>
                ) : null}
                {counting ? (
                  <p aria-hidden="true" className="text-xs tabular-nums text-white/70">
                    Playing in {remaining}s
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              ref={playNowRef}
              type="button"
              onClick={goNext}
              className="focus-ring inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-black transition-colors hover:bg-white/90"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
              Play now
            </button>
            {counting ? (
              <button
                type="button"
                onClick={() => setCancelled(true)}
                className="focus-ring inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold text-white/90 ring-1 ring-inset ring-white/30 transition-colors hover:bg-white/10 hover:text-white"
              >
                Cancel
              </button>
            ) : (
              <button
                ref={replayRef}
                type="button"
                onClick={onReplay}
                className="focus-ring inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-white/90 ring-1 ring-inset ring-white/30 transition-colors hover:bg-white/10 hover:text-white"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
                Replay
              </button>
            )}
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={autoplayEnabled}
            aria-label="Autoplay next"
            onClick={onToggleAutoplay}
            className="focus-ring inline-flex items-center gap-2 rounded-full px-2 py-1 text-xs font-medium text-white/80 transition-colors hover:text-white"
          >
            <span
              aria-hidden="true"
              className={cn(
                "relative inline-flex h-4 w-7 items-center rounded-full transition-colors",
                autoplayEnabled ? "bg-white" : "bg-white/25",
              )}
            >
              <span
                className={cn(
                  "inline-block h-3 w-3 rounded-full transition-transform",
                  autoplayEnabled ? "translate-x-3.5 bg-black" : "translate-x-0.5 bg-white",
                )}
              />
            </span>
            <span>Autoplay is {autoplayEnabled ? "on" : "off"}</span>
          </button>
        </>
      ) : (
        <button
          ref={replayRef}
          type="button"
          onClick={onReplay}
          className="focus-ring inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-black transition-colors hover:bg-white/90"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
            <path d="M3 3v5h5" />
          </svg>
          Replay
        </button>
      )}
    </div>
  );
}
