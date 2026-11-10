"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { loadVast } from "@/lib/vast-client";
import type { VastDocument } from "@/lib/vast";
import { canPlayVast } from "@/lib/vast-cooldown";
import { dueBreakSlot } from "@/lib/vast-schedule";

/** Mid/post-rolls retain the content element and its engine at the held position. */
export function useVastBreaks(
  videoRef: RefObject<HTMLVideoElement | null>, id: string,
  midrollUrl: string | null, midrollAt: number, postrollUrl: string | null,
  minimumDuration = 0, cooldown = 0, offsetPercent = 0, stopAt: number | null = null,
  intervalSeconds = 0,
) {
  const [state, setState] = useState<{ id: string; active: boolean; ad: VastDocument | null }>({ id, active: false, ad: null });
  const finishRef = useRef<() => void>(() => {});
  const finish = useCallback(() => finishRef.current(), []);
  const config = useRef({ midrollUrl, midrollAt, postrollUrl, minimumDuration, cooldown, offsetPercent, stopAt, intervalSeconds });
  useEffect(() => {
    config.current = { midrollUrl, midrollAt, postrollUrl, minimumDuration, cooldown, offsetPercent, stopAt, intervalSeconds };
  }, [midrollUrl, midrollAt, postrollUrl, minimumDuration, cooldown, offsetPercent, stopAt, intervalSeconds]);
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const controller = new AbortController();
    let active = false;
    let placement: "mid" | "post" = "mid";
    let heldAt = 0;
    let lastSlot = -1;
    let postPlayed = false;
    let resume = true;
    let looping = false;
    const repeat = () => {
      el.loop = true;
      el.currentTime = 0;
      if (resume) void el.play()?.catch(() => {});
    };
    const finish = () => {
      if (!active || controller.signal.aborted) return;
      active = false;
      setState({ id, active: false, ad: null });
      if (placement === "post") {
        if (looping) repeat();
        else el.dispatchEvent(new Event("ended"));
      }
      else {
        el.currentTime = heldAt;
        if (resume) void el.play()?.catch(() => {});
      }
    };
    finishRef.current = finish;
    const start = (kind: "mid" | "post", url: string) => {
      active = true;
      resume = true;
      placement = kind;
      heldAt = el.currentTime;
      setState({ id, active: true, ad: null });
      el.pause();
      void loadVast(url, controller.signal).then(ad => {
        if (controller.signal.aborted) return;
        if (!ad) finish();
        else setState({ id, active: true, ad });
      });
    };
    const hold = (event: Event) => {
      if (!active) return;
      event.stopImmediatePropagation();
      if (event.type === "play") el.pause();
      if (event.type === "seeking" && el.currentTime !== heldAt) el.currentTime = heldAt;
    };
    const time = (event: Event) => {
      if (active) { hold(event); return; }
      const { midrollUrl, midrollAt, minimumDuration, cooldown, offsetPercent, stopAt, intervalSeconds } = config.current;
      if (!midrollUrl || el.paused || !(el.duration >= minimumDuration)) return;
      const first = offsetPercent > 0 ? el.duration * offsetPercent / 100 : midrollAt;
      // Clip boundaries stay with the embed's ordinary timeupdate listener: no slot at or past stopAt.
      const slot = dueBreakSlot({ first, interval: intervalSeconds, duration: el.duration, time: el.currentTime, stopAt, lastSlot });
      if (slot === null) return;
      // Consumed before the cooldown check: a break inside the cooldown is skipped, not deferred.
      lastSlot = slot;
      if (canPlayVast(cooldown)) start("mid", midrollUrl);
    };
    const end = (event: Event) => {
      if (active) { hold(event); return; }
      const { postrollUrl, cooldown } = config.current;
      if (!postrollUrl || postPlayed) return;
      postPlayed = true;
      if (!canPlayVast(cooldown)) {
        if (looping) { event.stopImmediatePropagation(); repeat(); }
        return;
      }
      event.stopImmediatePropagation();
      start("post", postrollUrl);
    };
    const captureLoop = () => {
      if (!postPlayed && config.current.postrollUrl && el.loop) { looping = true; el.loop = false; }
      if (!config.current.postrollUrl && looping) el.loop = true;
    };
    const onTime = (event: Event) => { captureLoop(); time(event); };
    const handlers = { play: hold, pause: hold, seeking: hold, timeupdate: onTime, ended: end, loadedmetadata: captureLoop };
    const cancelResume = () => { resume = false; };
    el.addEventListener("vidra:pause-request", cancelResume);
    for (const [name, handler] of Object.entries(handlers)) el.addEventListener(name, handler, true);
    return () => {
      controller.abort();
      if (looping) el.loop = true;
      el.removeEventListener("vidra:pause-request", cancelResume);
      for (const [name, handler] of Object.entries(handlers)) el.removeEventListener(name, handler, true);
    };
  }, [videoRef, id]);
  return { active: state.id === id && state.active, ad: state.id === id ? state.ad : null, finish };
}
