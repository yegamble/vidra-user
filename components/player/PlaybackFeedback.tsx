"use client";
import { useEffect, useState } from "react";
import { PauseGlyph, PlayGlyph } from "@/components/player/icons";

/** Remounted for a playback transition; never leaves a permanent icon on pause. */
export function PlaybackFeedback({ paused }: { paused: boolean }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timeout = window.setTimeout(() => setVisible(false), 2000);
    return () => window.clearTimeout(timeout);
  }, []);
  if (!visible) return null;
  return <div data-testid="playback-feedback" aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
    <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/10 backdrop-blur-md">
      {paused ? <PauseGlyph size={36} /> : <PlayGlyph size={36} />}
    </span>
  </div>;
}
