"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/components/I18nProvider";
import { Spinner } from "@/components/ui/Spinner";
import { PauseGlyph, PlayGlyph, VolumeHighGlyph, VolumeMutedGlyph } from "./icons";
import { readStoredVolume } from "@/lib/player-volume";
import type { VastDocument } from "@/lib/vast";
import { trackVast } from "@/lib/vast-client";

const template = (value: string | undefined, original: string, fallback: string) => !value?.trim() || value === original ? fallback : value;
const secondsText = (value: string, seconds: number) => value.replaceAll("{seconds}", String(Math.max(0, Math.ceil(seconds))));

export function PrerollAd({ ad, onDone, onStart, initialVolume, initialMuted, showControls = true, skipAfterSeconds, skipCountdown, skipLabel, remainingMessage }: {
  ad: VastDocument; onDone: () => void; onStart?: () => void; initialVolume?: number; initialMuted?: boolean;
  showControls?: boolean; skipAfterSeconds?: number; skipCountdown?: string; skipLabel?: string; remainingMessage?: string;
}) {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const playRef = useRef<HTMLButtonElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const sent = useRef(new Set<string>());
  const done = useRef(false);
  const alive = useRef(true);
  const awaitingPlay = useRef(false);
  const initial = useRef({ volume: initialVolume, muted: initialMuted });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(false);
  const [loading, setLoading] = useState(true);
  const clear = useCallback(() => { clearTimeout(timer.current); timer.current = undefined; }, []);
  const track = useCallback((event: string) => {
    if (!alive.current || done.current || sent.current.has(event)) return;
    sent.current.add(event);
    trackVast(event === "impression" ? ad.impressions : ad.tracking[event] ?? []);
  }, [ad]);
  const finish = useCallback((event: "complete" | "skip" | "error", code?: number) => {
    if (!alive.current || done.current) return;
    if (event === "error") trackVast(ad.errors, code);
    else track(event);
    done.current = true;
    clear();
    onDone();
  }, [ad.errors, clear, onDone, track]);
  const arm = useCallback(() => {
    if (!done.current && !awaitingPlay.current && timer.current === undefined) timer.current = setTimeout(() => finish("error", 402), 12000);
  }, [finish]);
  const play = useCallback(() => {
    awaitingPlay.current = false;
    arm();
    void videoRef.current?.play()?.catch((error: unknown) => {
      if (!alive.current) return;
      awaitingPlay.current = true;
      clear(); setPaused(true); setLoading(false);
      const name = (error as { name?: string } | null)?.name;
      if (name !== "NotAllowedError" && name !== "AbortError") finish("error", 405);
    });
  }, [arm, clear, finish]);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    alive.current = true;
    const stored = readStoredVolume();
    const volume = initial.current.volume ?? stored.volume;
    video.volume = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : stored.volume;
    video.muted = initial.current.muted ?? stored.muted;
    playRef.current?.focus({ preventScroll: true });
    if (!ad.mediaUrl) finish("error", 303);
    else play();
    return () => { alive.current = false; clear(); video.pause(); };
  }, [ad.mediaUrl, clear, finish, play]);
  function playing() {
    if (done.current) return;
    awaitingPlay.current = false;
    clear(); setPaused(false); setLoading(false);
    const first = !sent.current.has("start");
    track("impression"); track("start");
    if (first) onStart?.();
    if (!showControls && document.activeElement === playRef.current) regionRef.current?.focus({ preventScroll: true });
  }
  function timeUpdate() {
    if (done.current) return;
    const time = videoRef.current?.currentTime ?? 0;
    setElapsed(time);
    if (!sent.current.has("start") || ad.duration <= 0) return;
    for (const [event, fraction] of [["firstQuartile", 0.25], ["midpoint", 0.5], ["thirdQuartile", 0.75]] as const) {
      if (time >= ad.duration * fraction) track(event);
    }
  }
  function togglePlay() { if (paused) play(); else videoRef.current?.pause(); }
  const skipAt = skipAfterSeconds === undefined || !Number.isFinite(skipAfterSeconds) ? ad.skipAfter
    : skipAfterSeconds > 0 ? Math.max(skipAfterSeconds, ad.skipAfter ?? skipAfterSeconds) : null;
  const canSkip = skipAt !== null && elapsed >= skipAt;
  const remaining = Math.max(0, Math.ceil(ad.duration - elapsed));
  const untilSkip = Math.max(0, Math.ceil((skipAt ?? 0) - elapsed));
  const countdown = secondsText(template(skipCountdown, "Skip in {seconds}…", t("watch.ad.skipIn", { seconds: untilSkip })), untilSkip);
  const skip = secondsText(template(skipLabel, "Skip ad", t("watch.ad.skip")), untilSkip);
  const remainingText = remainingMessage?.trim() === "" ? "" : secondsText(template(remainingMessage, "This ad will end in {seconds}", t("watch.ad.remaining", { seconds: remaining })), remaining);
  const control = "focus-ring-media inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white hover:bg-white/15";
  return (
    <div ref={regionRef} role="region" tabIndex={0} aria-label={t("watch.ad.label")} className="focus-ring-media absolute inset-0 z-40 bg-black text-white" onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()} onKeyDown={event => {
      event.stopPropagation();
      if (event.target === event.currentTarget && !event.repeat && [" ", "k", "K", "Enter"].includes(event.key)) { event.preventDefault(); togglePlay(); }
    }}>
      <video
        ref={videoRef} src={ad.mediaUrl} autoPlay playsInline crossOrigin="anonymous" controls={false} disablePictureInPicture disableRemotePlayback
        className="absolute inset-0 h-full w-full object-contain"
        onClick={togglePlay}
        onPlaying={playing} onTimeUpdate={timeUpdate} onEnded={() => finish("complete")} onError={() => finish("error", 405)}
        onLoadStart={arm} onPlay={arm} onWaiting={() => { setLoading(true); arm(); }}
        onStalled={() => { if ((videoRef.current?.readyState ?? 0) < 3) arm(); }}
        onPause={() => { awaitingPlay.current = true; clear(); setPaused(true); setLoading(false); }}
        onVolumeChange={() => setMuted(videoRef.current?.muted ?? false)}
      />
      {loading ? <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><Spinner variant="media" label={t("watch.ad.loading")} /></div> : null}
      <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
        <span className="rounded-md bg-black/80 px-2.5 py-1.5">{t("watch.ad.label")}</span>
        {remainingText ? <span className="rounded-md bg-black/80 px-2.5 py-1.5 tabular-nums">{remainingText}</span> : null}
      </div>
      <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-2 bg-gradient-to-t from-black/90 via-black/70 to-transparent px-3 pb-3 pt-10">
        {showControls || paused ? <button ref={playRef} type="button" className={control} aria-label={t(paused ? "watch.ad.play" : "watch.ad.pause")} onClick={togglePlay}>
          {paused ? <PlayGlyph /> : <PauseGlyph />}
        </button> : null}
        {showControls ? <button type="button" className={control} aria-label={t(muted ? "watch.ad.unmute" : "watch.ad.mute")} aria-pressed={muted} onClick={() => { const video = videoRef.current; if (video) video.muted = !video.muted; }}>
          {muted ? <VolumeMutedGlyph /> : <VolumeHighGlyph />}
        </button> : null}
        {ad.clickThrough ? <a href={ad.clickThrough} target="_blank" rel="noopener noreferrer" onClick={() => trackVast(ad.clickTracking)} className="focus-ring-media inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold underline underline-offset-2">{t("watch.ad.visit")}</a> : null}
        {canSkip ? <button type="button" onClick={() => finish("skip")} className="focus-ring-media ml-auto inline-flex min-h-11 items-center rounded-lg border border-white/60 bg-black/70 px-4 text-sm font-semibold hover:bg-black/90">{skip}</button>
          : skipAt !== null ? <span className="ml-auto px-2 text-xs tabular-nums">{countdown}</span> : null}
      </div>
    </div>
  );
}
