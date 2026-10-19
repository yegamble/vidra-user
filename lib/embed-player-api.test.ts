// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { startEmbedApi } from "./embed-player-api";

function setup(opts: { targetOrigin?: string } = {}) {
  const video = document.createElement("video");
  const play = vi.fn().mockResolvedValue(undefined);
  const pause = vi.fn();
  Object.defineProperty(video, "play", { value: play });
  Object.defineProperty(video, "pause", { value: pause });
  Object.defineProperty(video, "duration", { value: 100, configurable: true });
  const posted: { data: Record<string, unknown>; origin: string }[] = [];
  const parent = {
    postMessage: (data: string, origin: string) => posted.push({ data: JSON.parse(data), origin }),
  } as unknown as Window;
  const api = startEmbedApi({ video, parent, scope: "peertube", targetOrigin: opts.targetOrigin ?? "*", statusIntervalMs: 0 });
  const send = (msg: unknown, source: unknown = parent) =>
    window.dispatchEvent(new MessageEvent("message", { data: typeof msg === "string" ? msg : JSON.stringify(msg), source: source as Window }));
  return { video, play, pause, posted, send, api, parent };
}
const last = (p: { data: Record<string, unknown> }[]) => p[p.length - 1].data;

describe("embed player API", () => {
  afterEach(() => vi.restoreAllMocks());

  it("lets preroll handle API play intent before calling native play", () => {
    const { video, play, send, api } = setup();
    video.addEventListener("vidra:play-request", event => event.preventDefault());
    send({ id: 1, method: "peertube::play" });
    expect(play).not.toHaveBeenCalled();
    api.stop();
  });

  it("notifies ready with the scoped method name", () => {
    const { posted, api } = setup();
    api.notifyReady();
    expect(last(posted)).toEqual({ method: "peertube::ready", params: true });
  });

  it("drives the player from requests and answers by id", () => {
    const { video, play, pause, posted, send, api } = setup();
    send({ id: 1, method: "peertube::play" });
    expect(play).toHaveBeenCalled();
    const cancelAdResume = vi.fn();
    video.addEventListener("vidra:pause-request", cancelAdResume);
    send({ id: 2, method: "peertube::pause" });
    expect(pause).toHaveBeenCalled();
    expect(cancelAdResume).toHaveBeenCalledTimes(1);
    send({ id: 3, method: "peertube::seek", params: 42 });
    expect(video.currentTime).toBe(42);
    send({ id: 4, method: "peertube::setVolume", params: 0.5 });
    expect(video.volume).toBe(0.5);
    send({ id: 5, method: "peertube::getVolume" });
    expect(last(posted)).toEqual({ id: 5, result: 0.5 });
    send({ id: 6, method: "peertube::setPlaybackRate", params: 1.5 });
    expect(video.playbackRate).toBe(1.5);
    send({ id: 7, method: "peertube::getPlaybackRate" });
    expect(last(posted)).toEqual({ id: 7, result: 1.5 });
    send({ id: 8, method: "peertube::getPlaybackRates" });
    expect((last(posted).result as number[]).includes(1)).toBe(true);
    send({ id: 9, method: "peertube::isReady" });
    expect(last(posted)).toEqual({ id: 9, result: false });
    api.notifyReady();
    send({ id: 10, method: "peertube::isReady" });
    expect(last(posted)).toEqual({ id: 10, result: true });
    send({ id: 11, method: "peertube::getResolutions" });
    expect(last(posted)).toEqual({ id: 11, result: [] });
    send({ id: 12, method: "peertube::getCaptions" });
    expect(last(posted)).toEqual({ id: 12, result: [] });
    api.stop();
  });

  it("ignores wrong scope, non-protocol, unknown-method, and non-parent messages", () => {
    const { video, posted, send, api } = setup();
    const n = posted.length;
    send({ id: 1, method: "other::seek", params: 9 });
    send("not json");
    send({ id: 2, method: "peertube::seek", params: 9 }, window);
    send({ id: 3, method: "peertube::seek", params: "9" });
    send({ id: 4, method: "peertube::setVolume", params: 7 });
    send({ id: 5, method: "peertube::eval", params: "alert(1)" });
    expect(video.currentTime).toBe(0);
    expect(video.volume).toBe(1);
    expect(posted.slice(n).map((m) => m.data)).toEqual([
      { id: 3, error: "runtime_error", message: "invalid params" },
      { id: 4, error: "runtime_error", message: "invalid params" },
      { id: 5, error: "method_not_found", message: "peertube::eval" },
    ]);
    api.stop();
  });

  it("treats inherited names as unknown methods", () => {
    const { posted, send, api } = setup();
    for (const name of ["constructor", "toString", "valueOf", "__proto__", "hasOwnProperty"]) {
      send({ id: 1, method: `peertube::${name}` });
      expect(last(posted)).toEqual({ id: 1, error: "method_not_found", message: `peertube::${name}` });
    }
    api.stop();
  });

  it("validates playback rate range and caption id type", () => {
    const { video, posted, send, api } = setup();
    for (const bad of [0, 17, -1, "2", null, Number.NaN]) {
      send({ id: 2, method: "peertube::setPlaybackRate", params: bad });
      expect(last(posted)).toEqual({ id: 2, error: "runtime_error", message: "invalid params" });
    }
    expect(video.playbackRate).toBe(1);
    send({ id: 3, method: "peertube::setPlaybackRate", params: 16 });
    expect(video.playbackRate).toBe(16);
    send({ id: 4, method: "peertube::setCaption", params: 5 });
    expect(last(posted)).toEqual({ id: 4, error: "runtime_error", message: "invalid params" });
    send({ id: 5, method: "peertube::setCaption", params: "en" });
    expect(last(posted)).toEqual({ id: 5, result: null });
    api.stop();
  });

  it("emits playbackStatusChange, playbackStatusUpdate and volumeChange", () => {
    const { video, posted, api } = setup();
    video.dispatchEvent(new Event("play"));
    expect(last(posted)).toEqual({ method: "peertube::playbackStatusChange", params: "playing" });
    video.dispatchEvent(new Event("pause"));
    expect(last(posted)).toEqual({ method: "peertube::playbackStatusChange", params: "paused" });
    video.dispatchEvent(new Event("ended"));
    expect(last(posted)).toEqual({ method: "peertube::playbackStatusChange", params: "ended" });
    api.emitStatus();
    expect(last(posted)).toEqual({
      method: "peertube::playbackStatusUpdate",
      params: { position: 0, volume: 1, duration: 100, playbackState: "ended" },
    });
    video.dispatchEvent(new Event("volumechange"));
    expect(last(posted)).toEqual({ method: "peertube::volumeChange", params: 1 });
    api.stop();
  });

  it("posts to the known parent origin, else *", () => {
    const a = setup({ targetOrigin: "https://blog.example" });
    a.api.notifyReady();
    expect(last(a.posted)).toBeDefined();
    expect(a.posted[a.posted.length - 1].origin).toBe("https://blog.example");
    a.api.stop();
    const b = setup();
    b.api.notifyReady();
    expect(b.posted[b.posted.length - 1].origin).toBe("*");
    b.api.stop();
  });

  it("stops listening after stop()", () => {
    const { video, send, api } = setup();
    api.stop();
    send({ id: 1, method: "peertube::seek", params: 5 });
    expect(video.currentTime).toBe(0);
  });
});
