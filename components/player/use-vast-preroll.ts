"use client";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { loadVast, type VastDocument } from "@/lib/vast-client";
import { canPlayVast } from "@/lib/vast-cooldown";

type Run = { id: string; live: boolean; passed: boolean; intent: boolean; resume: boolean;
  pauses: number; position: number | null; tag?: string | null; controller: AbortController | null; ad: VastDocument | null };
const fresh = (id: string): Run => ({ id, live: true, passed: false, intent: false,
  resume: false, pauses: 0, position: null, controller: null, ad: null });
type View = { id: string; passed: boolean; active: boolean; ad: VastDocument | null };

/** Content keeps its own media element; callers suspend its engine while blocked. */
export function useVastPreroll(videoRef: RefObject<HTMLVideoElement | null>, id: string,
  tagUrl: string | null | undefined, cooldownSeconds = 0) {
  const scope = useRef<Run>(fresh(id));
  const [view, setView] = useState<View>({ id, passed: false, active: false, ad: null });
  const publish = useCallback((run: Run) => {
    if (scope.current !== run || !run.live) return;
    setView({ id: run.id, passed: run.passed, active: run.intent && !run.passed, ad: run.ad });
  }, []);
  const resume = useCallback((run: Run) => {
    const el = videoRef.current;
    if (!run.live || !run.resume || !run.passed || !el
      || (!el.currentSrc && !el.getAttribute("src"))) return;
    run.resume = false; // loadstart/canplay may both arrive; attempt only once
    void el.play()?.catch(() => {}); // policy refusal remains click-to-play
  }, [videoRef]);
  const finish = useCallback(() => {
    const run = scope.current;
    if (run.id !== id || !run.live || run.passed) return;
    run.passed = true; run.ad = null; run.resume = run.intent; run.controller?.abort();
    publish(run); resume(run);
  }, [id, publish, resume]);
  const start = useCallback((run: Run, tag: string | null | undefined) => {
    if (!tag || run.controller || run.passed) return;
    if (!canPlayVast(cooldownSeconds)) { finish(); return; }
    const controller = new AbortController();
    run.controller = controller;
    void loadVast(tag, controller.signal).then((ad) => {
      if (!run.live || scope.current !== run || controller.signal.aborted || run.controller !== controller) return;
      run.ad = ad;
      if (ad) publish(run); else finish();
    }).catch(() => {
      if (run.live && scope.current === run && !controller.signal.aborted && run.controller === controller) finish();
    });
  }, [finish, publish, cooldownSeconds]);
  const requestPlay = useCallback(() => {
    const run = scope.current;
    if (tagUrl === null || (tagUrl !== undefined && run.id === id && run.passed)) return false;
    if (run.id === id && run.live) {
      const position = videoRef.current?.currentTime;
      if (position && Number.isFinite(position)) run.position = position;
      run.intent = true; publish(run); start(run, tagUrl);
    }
    return true;
  }, [id, tagUrl, publish, start, videoRef]);

  useEffect(() => {
    const run = fresh(id);
    scope.current = run; publish(run);
    return () => { run.live = false; run.resume = false; run.controller?.abort(); };
  }, [id, publish]);
  useEffect(() => {
    const run = scope.current;
    if (run.tag !== tagUrl) {
      run.controller?.abort(); run.controller = null; run.ad = null; run.tag = tagUrl;
      publish(run);
    }
    if (tagUrl === null) finish();
    else if (run.intent) start(run, tagUrl);
  }, [id, tagUrl, finish, start, publish]);
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const run = scope.current;
    const onPlay = (event: Event) => {
      if (!requestPlay()) return;
      event.stopImmediatePropagation();
      if (!el.paused) {
        run.pauses++; // pause dispatch is normally queued, not synchronous
        el.pause();
      }
    };
    const onPause = (event: Event) => {
      if (run.pauses > 0 || tagUrl === undefined || (tagUrl !== null && !run.passed)) event.stopImmediatePropagation();
      if (run.pauses > 0) { run.pauses--; return; }
      run.intent = false; run.resume = false; publish(run);
    };
    const onPauseRequest = () => { run.intent = false; run.resume = false; publish(run); };
    const onPlayRequest = (event: Event) => { if (requestPlay()) event.preventDefault(); };
    const onSource = () => resume(run);
    const onMetadata = () => {
      if (!run.passed || run.position === null) return;
      el.currentTime = Number.isFinite(el.duration) ? Math.min(run.position, el.duration) : run.position;
      run.position = null;
    };
    // Capture precedes the shell's ordinary listeners even after config changes.
    el.addEventListener("play", onPlay, true);
    el.addEventListener("pause", onPause, true);
    el.addEventListener("vidra:pause-request", onPauseRequest);
    el.addEventListener("vidra:play-request", onPlayRequest, true);
    el.addEventListener("loadedmetadata", onMetadata);
    el.addEventListener("loadstart", onSource);
    el.addEventListener("canplay", onSource);
    return () => {
      el.removeEventListener("play", onPlay, true);
      el.removeEventListener("pause", onPause, true);
      el.removeEventListener("vidra:pause-request", onPauseRequest);
      el.removeEventListener("vidra:play-request", onPlayRequest, true);
      el.removeEventListener("loadedmetadata", onMetadata);
      el.removeEventListener("loadstart", onSource);
      el.removeEventListener("canplay", onSource);
    };
  }, [id, tagUrl, videoRef, requestPlay, publish, resume]);
  const current = view.id === id ? view : null;
  const blocked = tagUrl === undefined || (tagUrl !== null && !current?.passed);
  return { blocked, active: blocked && !!current?.active, ad: current?.ad ?? null, requestPlay, finish };
}
