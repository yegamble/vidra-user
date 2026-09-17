"use client";
import { useEffect, useState, type RefObject } from "react";

type Timer = { videoId: string; value: string; deadline: number | null; expired: boolean };
export function useSleepTimer(videoRef: RefObject<HTMLVideoElement | null>, videoId: string) {
  const [timer, setTimer] = useState<Timer | null>(null);
  // Navigation cancels the timer permanently, including a later Back navigation.
  if (timer && timer.videoId !== videoId) setTimer(null);
  const current = timer?.videoId === videoId ? timer : null;
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !current) return;
    const expire = () => {
      if (current.expired) return;
      video.pause();
      setTimer({ ...current, value: "off", deadline: null, expired: true });
    };
    const check = () => { if (current.deadline !== null && Date.now() >= current.deadline) expire(); };
    const resume = () => { if (current.expired) setTimer(null); };
    const timeout = current.deadline === null ? undefined : window.setTimeout(expire, Math.max(0, current.deadline - Date.now()));
    if (current.value === "end") video.addEventListener("ended", expire);
    video.addEventListener("timeupdate", check);
    video.addEventListener("play", resume);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearTimeout(timeout);
      video.removeEventListener("ended", expire);
      video.removeEventListener("timeupdate", check);
      video.removeEventListener("play", resume);
      document.removeEventListener("visibilitychange", check);
    };
  }, [current, videoRef]);
  return {
    value: current?.value ?? "off",
    expired: current?.expired ?? false,
    select(value: string) {
      if (value === "off") { setTimer(null); return; }
      if (value !== "end" && ![10, 15, 30, 45, 60].includes(Number(value))) return;
      setTimer({ videoId, value, deadline: value === "end" ? null : Date.now() + Number(value) * 60000, expired: false });
    },
  };
}
