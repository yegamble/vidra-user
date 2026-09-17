"use client";
import { useCallback, useEffect, useRef, useState, type HTMLAttributes, type RefObject } from "react";
import { clampSeekTarget } from "@/lib/player-shortcuts";

type Options = {
  videoRef: RefObject<HTMLVideoElement | null>;
  controlsVisible: boolean;
  onTogglePlay: () => void;
  onShowControls: () => void;
  onSeek?: (time: number) => void;
};
type Direction = 1 | -1;
type Feedback = { direction: Direction; seconds: number };
type Tap = { direction: Direction; x: number; y: number; at: number; seeking: boolean };
type Touch = { id: number; x: number; y: number; at: number; visible: boolean };

// These regions and timings are product choices, not published YouTube values.
// Short taps can seek; drags, long presses and pinches remain browser gestures.
const DOUBLE_TAP_MS = 300, BURST_MS = 750, TAP_MS = 500, MOVE_PX = 12;
function zone(x: number, video: HTMLVideoElement): Direction | 0 | null {
  const rect = video.getBoundingClientRect();
  const fraction = (x - rect.left) / rect.width;
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) return null;
  return fraction < 0.35 ? -1 : fraction > 0.65 ? 1 : 0;
}

export function usePlayerSeeking({ videoRef, controlsVisible, onTogglePlay, onShowControls, onSeek }: Options) {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const burst = useRef<(Feedback & { at: number }) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const touch = useRef<Touch | null>(null);
  const lastTap = useRef<Tap | null>(null);
  const pointers = useRef(new Set<number>());
  const suppressClickUntil = useRef(0);
  const resetFeedback = useCallback(() => {
    clearTimeout(timer.current);
    burst.current = null;
    lastTap.current = null;
    setFeedback(null);
  }, []);
  const cancelTouch = useCallback(() => { touch.current = null; lastTap.current = null; }, []);

  useEffect(() => {
    // A second finger may land outside the video, and a drag may end outside it.
    // Passive document listeners cancel recognition without blocking scroll/zoom.
    const down = (event: PointerEvent) => {
      if (event.pointerType === "touch" && !event.isPrimary) cancelTouch();
    };
    const end = (event: PointerEvent) => {
      pointers.current.delete(event.pointerId);
      if (touch.current?.id === event.pointerId) cancelTouch();
    };
    document.addEventListener("pointerdown", down, { passive: true });
    document.addEventListener("pointerup", end, { passive: true });
    document.addEventListener("pointercancel", end, { passive: true });
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", end);
    };
  }, [cancelTouch]);

  const seekBy = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(seconds) || seconds === 0 || !Number.isFinite(video.currentTime)) return;
    const target = clampSeekTarget(video.currentTime, seconds, video.duration);
    const moved = target - video.currentTime;
    if (moved === 0) return;
    video.currentTime = target;
    onSeek?.(target);
    const direction: Direction = moved > 0 ? 1 : -1;
    const prior = burst.current;
    const total = Math.abs(moved) + (prior?.direction === direction && Date.now() - prior.at <= BURST_MS ? prior.seconds : 0);
    const next = { direction, seconds: Math.round(total * 1000) / 1000 };
    burst.current = { ...next, at: Date.now() };
    setFeedback(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(resetFeedback, BURST_MS);
  }, [videoRef, onSeek, resetFeedback]);

  const isSurface = (event: { target: EventTarget; currentTarget: EventTarget }) =>
    event.target === videoRef.current && event.currentTarget === videoRef.current && !videoRef.current?.controls;
  const surfaceHandlers: HTMLAttributes<HTMLVideoElement> = {
    onPointerDown(event) {
      if (!isSurface(event)) return;
      if (event.pointerType !== "touch") {
        if (event.button === 0) suppressClickUntil.current = 0;
        return;
      }
      suppressClickUntil.current = Date.now() + 1000;
      pointers.current.add(event.pointerId);
      if (!event.isPrimary || pointers.current.size > 1) { cancelTouch(); return; }
      touch.current = { id: event.pointerId, x: event.clientX, y: event.clientY,
        at: Date.now(), visible: controlsVisible };
    },
    onPointerMove(event) {
      const active = touch.current;
      if (active?.id === event.pointerId && Math.hypot(event.clientX - active.x, event.clientY - active.y) > MOVE_PX) cancelTouch();
    },
    onPointerCancel(event) {
      pointers.current.delete(event.pointerId);
      cancelTouch();
    },
    onPointerUp(event) {
      if (event.pointerType !== "touch") return;
      pointers.current.delete(event.pointerId);
      suppressClickUntil.current = Date.now() + 1000;
      const active = touch.current;
      touch.current = null;
      if (!active || active.id !== event.pointerId || !isSurface(event)) return;
      if (Date.now() - active.at > TAP_MS || Math.hypot(event.clientX - active.x, event.clientY - active.y) > MOVE_PX) {
        cancelTouch(); return;
      }
      const direction = zone(event.clientX, event.currentTarget);
      if (direction === null || direction !== zone(active.x, event.currentTarget)) { cancelTouch(); return; }
      onShowControls();
      if (direction === 0) {
        resetFeedback();
        if (active.visible) onTogglePlay();
        return;
      }
      const previous = lastTap.current;
      const continued = previous?.direction === direction
        && active.at - previous.at <= (previous.seeking ? BURST_MS : DOUBLE_TAP_MS)
        && Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= 48;
      if (continued) seekBy(direction * 10);
      lastTap.current = { direction, x: event.clientX, y: event.clientY, at: Date.now(), seeking: continued };
    },
    onClick(event) {
      if (!isSurface(event) || event.button !== 0) return;
      const native = event.nativeEvent as MouseEvent & { pointerType?: string; sourceCapabilities?: { firesTouchEvents?: boolean } };
      if (native.pointerType === "touch" || native.sourceCapabilities?.firesTouchEvents
        || (event.detail !== 0 && Date.now() < suppressClickUntil.current)) return;
      resetFeedback();
      onTogglePlay();
    },
  };
  return { seekBy, feedback, resetFeedback, surfaceHandlers };
}
