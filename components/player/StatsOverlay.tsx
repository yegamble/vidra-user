"use client";

import { useEffect, useRef, useState } from "react";

import { CloseIcon } from "@/components/icons";
import { collectPlaybackStats, statsRows, type PlaybackStats, type StatsEngine } from "@/lib/player-stats";

const POLL_MS = 1000;

/**
 * "Stats for nerds": a polled, read-only readout over the video. It is a named
 * group (not a live region — a once-a-second announcement would drown the
 * screen reader), takes focus on open via its close button, and Escape closes it
 * and hands focus back through `onClose`.
 */
export function StatsOverlay({ videoRef, getEngine, engineName, onClose }: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  getEngine?: () => StatsEngine | null;
  engineName: string;
  onClose: () => void;
}) {
  const [stats, setStats] = useState<PlaybackStats | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const read = () => {
      const el = videoRef.current;
      if (el) setStats(collectPlaybackStats(el, getEngine?.() ?? null, engineName));
    };
    read();
    const timer = window.setInterval(read, POLL_MS);
    return () => window.clearInterval(timer);
  }, [videoRef, getEngine, engineName]);

  useEffect(() => { closeRef.current?.focus({ preventScroll: true }); }, []);

  return (
    <div
      role="group"
      aria-label="Playback statistics"
      onKeyDown={(e) => {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
      }}
      className="absolute left-3 top-3 z-20 max-w-[calc(100%-1.5rem)] rounded-xl bg-black/80 p-3 font-mono text-[11px] leading-5 text-white/90 shadow-lg"
    >
      <button ref={closeRef} type="button" aria-label="Close statistics" onClick={onClose}
        className="focus-ring-media absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full text-white/80 hover:text-white">
        <CloseIcon size={14} />
      </button>
      <dl className="grid grid-cols-[auto_auto] gap-x-4 pr-6">
        {stats ? statsRows(stats).map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-white/60">{label}</dt>
            <dd className="tabular-nums">{value}</dd>
          </div>
        )) : null}
      </dl>
    </div>
  );
}
