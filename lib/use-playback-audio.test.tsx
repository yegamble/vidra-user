// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useHlsPlayback } from "./use-playback-engine";

const mock = vi.hoisted(() => ({ instances: [] as MockHls[] }));

class MockHls {
  static Events = {
    MANIFEST_PARSED: "manifest", AUDIO_TRACKS_UPDATED: "tracks",
    AUDIO_TRACK_SWITCHED: "switched", ERROR: "error",
  };
  static ErrorTypes = {};
  static isSupported = () => true;
  audioTracks: Array<{ name: string; lang?: string }> = [];
  audioTrack = -1;
  levels = [];
  firstAutoLevel = -1;
  destroyed = false;
  handlers = new Map<string, Array<(...args: unknown[]) => void>>();
  constructor() { mock.instances.push(this); }
  on(event: string, handler: (...args: unknown[]) => void) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
  }
  emit(event: string, data?: unknown) {
    for (const fn of this.handlers.get(event) ?? []) fn(event, data);
  }
  loadSource() {}
  attachMedia() {}
  destroy() { this.destroyed = true; }
}

vi.mock("hls.js", () => ({ default: MockHls }));
vi.mock("@/lib/playback-session", () => ({
  usePlaybackSession: () => ({ status: "error", session: null }),
  playbackMasterUrl: (_state: unknown, fallback: string) => fallback,
  videoNeedsPlaybackToken: () => false,
}));
vi.mock("@/lib/use-playback-qoe", () => {
  const telemetry = { observeFetch() {}, reportRendition() {}, reportError() {} };
  return { usePlaybackQoE: () => telemetry };
});

class NativeTracks extends EventTarget {
  [index: number]: { label: string; language: string; enabled: boolean };
  length = 2;
  constructor() {
    super();
    this[0] = { label: "English", language: "en", enabled: true };
    this[1] = { label: "", language: "es", enabled: false };
  }
}

beforeEach(() => {
  mock.instances.length = 0;
  Object.defineProperty(window, "MediaSource", { configurable: true, value: class {} });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, "MediaSource");
});

function setup(native = false) {
  if (native) {
    Reflect.deleteProperty(window, "MediaSource");
    vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("maybe");
  }
  const video = document.createElement("video");
  const ref = { current: video };
  const hook = renderHook(({ id, master }) =>
    useHlsPlayback(ref, { id, hls_url: master }, null),
  { initialProps: { id: "first", master: "/first.m3u8" } });
  return { video, ...hook };
}

describe("playback audio tracks", () => {
  it("lists and switches real HLS tracks, follows engine changes, and rejects absent choices", async () => {
    const { result } = setup();
    await waitFor(() => expect(mock.instances).toHaveLength(1));
    const hls = mock.instances[0];
    hls.audioTracks = [{ name: "English" }, { name: "", lang: "es" }];
    hls.audioTrack = 0;
    act(() => hls.emit("tracks"));
    expect(result.current.audioTracks.map((track) => track.label)).toEqual(["English", "es"]);
    const [english, spanish] = result.current.audioTracks;
    expect(result.current.currentAudioTrack).toBe(english.value);
    act(() => result.current.setAudioTrack(spanish.value));
    expect(hls.audioTrack).toBe(1);
    expect(result.current.currentAudioTrack).toBe(spanish.value);
    act(() => result.current.setAudioTrack("hlsjs:audio:99"));
    expect(hls.audioTrack).toBe(1);
    hls.audioTrack = 0;
    act(() => hls.emit("switched"));
    expect(result.current.currentAudioTrack).toBe(english.value);
    hls.audioTracks = [];
    act(() => hls.emit("tracks"));
    expect(result.current.audioTracks).toEqual([]);
    expect(result.current.currentAudioTrack).toBe("");
  });

  it("discards old HLS choices and callbacks when the source changes", async () => {
    const { result, rerender } = setup();
    await waitFor(() => expect(mock.instances).toHaveLength(1));
    const first = mock.instances[0];
    first.audioTracks = [{ name: "First" }];
    first.audioTrack = 0;
    act(() => first.emit("manifest"));
    const stale = result.current;
    expect(stale.audioTracks).toHaveLength(1);
    rerender({ id: "first", master: "/second.m3u8" });
    expect(result.current.audioTracks).toEqual([]);
    await waitFor(() => expect(mock.instances).toHaveLength(2));
    const second = mock.instances[1];
    act(() => {
      first.emit("tracks");
      stale.setAudioTrack(stale.audioTracks[0].value);
    });
    expect(first.destroyed).toBe(true);
    expect(second.audioTrack).toBe(-1);
    expect(result.current.audioTracks).toEqual([]);
    second.audioTracks = [{ name: "Second" }];
    second.audioTrack = 0;
    act(() => second.emit("tracks"));
    expect(result.current.audioTracks[0].label).toBe("Second");
  });

  it("rejects a stale selection if HLS replaced the rendition group in place", async () => {
    const { result } = setup();
    await waitFor(() => expect(mock.instances).toHaveLength(1));
    const hls = mock.instances[0];
    hls.audioTracks = [{ name: "English" }, { name: "Spanish" }];
    hls.audioTrack = 0;
    act(() => hls.emit("tracks"));
    const stale = result.current;
    hls.audioTracks[1] = { name: "Commentary" };
    act(() => stale.setAudioTrack(stale.audioTracks[1].value));
    expect(hls.audioTrack).toBe(0);
  });

  it("clears HLS audio after fatal fallback and ignores late destroyed-engine events", async () => {
    const { result } = setup();
    await waitFor(() => expect(mock.instances).toHaveLength(1));
    const hls = mock.instances[0];
    hls.audioTracks = [{ name: "English" }];
    hls.audioTrack = 0;
    act(() => hls.emit("tracks"));
    expect(result.current.audioTracks).toHaveLength(1);
    act(() => hls.emit("error", { fatal: true }));
    expect(result.current.mode).toBe("progressive");
    act(() => hls.emit("switched"));
    expect(result.current.audioTracks).toEqual([]);
    expect(result.current.currentAudioTrack).toBe("");
  });

  it("selects native tracks, follows track-list changes, and removes its listeners on unmount", () => {
    const { video, result, unmount } = setup(true);
    const tracks = new NativeTracks();
    Object.defineProperty(video, "audioTracks", { value: tracks });
    Object.defineProperty(video, "currentSrc", { configurable: true, value: result.current.src });
    act(() => video.dispatchEvent(new Event("loadedmetadata")));
    expect(result.current.audioTracks.map((track) => track.label)).toEqual(["English", "es"]);
    const [english, spanish] = result.current.audioTracks;
    act(() => result.current.setAudioTrack(spanish.value));
    expect([tracks[0].enabled, tracks[1].enabled]).toEqual([false, true]);
    expect(result.current.currentAudioTrack).toBe(spanish.value);
    tracks[0].enabled = true;
    tracks[1].enabled = false;
    act(() => tracks.dispatchEvent(new Event("change")));
    expect(result.current.currentAudioTrack).toBe(english.value);
    tracks.length = 1;
    act(() => tracks.dispatchEvent(new Event("removetrack")));
    expect(result.current.audioTracks).toHaveLength(1);
    const stale = result.current;
    const remove = vi.spyOn(tracks, "removeEventListener");
    unmount();
    expect(remove).toHaveBeenCalledWith("change", expect.any(Function));
    tracks[0].enabled = false;
    stale.setAudioTrack(english.value);
    expect(tracks[0].enabled).toBe(false);
    expect(mock.instances).toHaveLength(0);
  });

  it("hides the previous native source's tracks until new metadata arrives", () => {
    const { video, result, rerender } = setup(true);
    const tracks = new NativeTracks();
    Object.defineProperty(video, "audioTracks", { value: tracks });
    Object.defineProperty(video, "currentSrc", { configurable: true, value: result.current.src });
    act(() => video.dispatchEvent(new Event("loadedmetadata")));
    expect(result.current.audioTracks).toHaveLength(2);
    rerender({ id: "second", master: "/second.m3u8" });
    act(() => tracks.dispatchEvent(new Event("change")));
    expect(result.current.audioTracks).toEqual([]);
    tracks[0] = { label: "New audio", language: "en", enabled: true };
    tracks.length = 1;
    Object.defineProperty(video, "currentSrc", { configurable: true, value: result.current.src });
    act(() => video.dispatchEvent(new Event("loadedmetadata")));
    expect(result.current.audioTracks.map((track) => track.label)).toEqual(["New audio"]);
    act(() => video.dispatchEvent(new Event("emptied")));
    expect(result.current.audioTracks).toEqual([]);
  });

  it("advertises no invented selectable tracks when the browser exposes none", () => {
    const { result } = setup(true);
    expect(result.current.audioTracks).toEqual([]);
    expect(result.current.currentAudioTrack).toBe("");
    act(() => result.current.setAudioTrack("native:audio:0"));
  });
});
