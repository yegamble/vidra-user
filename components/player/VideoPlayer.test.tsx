// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VideoPlayer, type CaptionTrack } from "./VideoPlayer";
import { api, type Video } from "@/lib/api";
import { setInstanceDefaultsForTests } from "@/lib/instance-defaults";
import {
  DEFAULT_PLAYER_SETTINGS,
  hydratePlayerSettings,
  resetPlayerSettings,
} from "@/lib/player-settings";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

// hls.js is imported ONLY once that engine has won selection, so this stand-in
// is inert for every test below except the start-on-open ones, which put the
// player in MSE mode on purpose (MediaSource + an hls_url) to reproduce the
// "<video> rendered with no src yet" window an SPA navigation lands in. It
// declines, which walks the shell down to the progressive original — the same
// transition a 404 master makes — without pulling the real chunk into jsdom.
vi.mock("hls.js", () => ({
  default: class MockHls {
    static isSupported() {
      return false;
    }
  },
}));

const VIDEO = {
  id: "v1",
  channel_id: "c1",
  title: "Clip",
  privacy: "public",
  state: "published",
  created_at: new Date().toISOString(),
  has_thumbnail: false,
  duration_seconds: 120,
  // no hls_url → progressive "original" mode (no hls.js import in jsdom)
} as unknown as Video;

const NEXT_VIDEO = {
  id: "v2",
  title: "Up next clip",
  channel_display_name: "Grade House",
  has_thumbnail: false,
} as unknown as Video;

function Harness({
  tracks = [] as CaptionTrack[],
  variant = "watch" as "watch" | "embed",
  nextVideo = null as Video | null,
  video = VIDEO,
}: {
  tracks?: CaptionTrack[];
  variant?: "watch" | "embed";
  nextVideo?: Video | null;
  video?: Video;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  return (
    <VideoPlayer
      video={video}
      videoRef={ref}
      startAt={null}
      tracks={tracks}
      variant={variant}
      nextVideo={nextVideo}
    />
  );
}

beforeEach(() => {
  // jsdom does not implement media playback — stub the transport the shell calls.
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  push.mockClear();
  window.sessionStorage.clear();
  resetPlayerSettings(); // drop any per-user settings a test hydrated
  // Undo any PiP capability stubs a test installed.
  delete (document as unknown as { pictureInPictureEnabled?: boolean }).pictureInPictureEnabled;
  delete (document as unknown as { pictureInPictureElement?: unknown }).pictureInPictureElement;
  delete (HTMLVideoElement.prototype as unknown as { requestPictureInPicture?: unknown })
    .requestPictureInPicture;
});

describe("VideoPlayer shell", () => {
  it("opens at the volume this device last chose, and remembers a change", async () => {
    localStorage.setItem("vidra.player.volume", "0.3");
    const { container } = render(<Harness />);
    const video = container.querySelector("video") as HTMLVideoElement;
    await waitFor(() => expect(video.volume).toBeCloseTo(0.3, 3));

    await act(async () => {
      video.volume = 0.6;
      video.dispatchEvent(new Event("volumechange"));
    });
    expect(localStorage.getItem("vidra.player.volume")).toBe("0.6");
  });

  // A32/A33 carry-in: with the object store down every source 503s, the last
  // engine's media element errors, and the stage used to render a dead
  // 0:00/0:00 with no message anywhere in the DOM. The viewer is told now.
  it("states the failure and offers a retry when no engine can play the video", async () => {
    const { container } = render(<Harness />);
    const video = container.querySelector("video") as HTMLVideoElement;
    expect(screen.queryByRole("alert")).toBeNull();

    await act(async () => {
      video.dispatchEvent(new Event("error"));
    });

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/could not be played/i);
    expect(within(alert).getByRole("button", { name: /try again/i })).toBeTruthy();
  });

  it("clears the failure surface when the retry succeeds", async () => {
    const { container } = render(<Harness />);
    const video = container.querySelector("video") as HTMLVideoElement;
    await act(async () => {
      video.dispatchEvent(new Event("error"));
    });
    const retry = screen.getByRole("button", { name: /try again/i });

    await act(async () => {
      fireEvent.click(retry);
    });

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders a chrome-less video (no native controls) under a custom overlay", () => {
    const { container } = render(<Harness />);
    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(video?.hasAttribute("controls")).toBe(false);
    // The custom control surface: seek + volume sliders and the core buttons.
    expect(screen.getByRole("slider", { name: "Seek" })).toBeTruthy();
    expect(screen.getByRole("slider", { name: "Volume" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mute" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fullscreen" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Speed: 1×" })).toBeTruthy();
  });

  it("hides the quality selector and captions toggle when neither is available", () => {
    render(<Harness />);
    // Original playback → no selectable levels → no quality menu.
    expect(screen.queryByRole("button", { name: /^Quality:/ })).toBeNull();
    // No caption tracks → no captions toggle.
    expect(screen.queryByRole("button", { name: "Captions" })).toBeNull();
  });

  it("shows a captions toggle when the video carries tracks", () => {
    render(<Harness tracks={[{ language: "en", label: "English", url: "blob:cc" }]} />);
    const cc = screen.getByRole("button", { name: "Captions" });
    expect(cc.getAttribute("aria-pressed")).toBe("false");
  });

  // A text-track list a media element can FORGET, which is what Safari does on
  // the native-HLS path: <video src> points straight at the master playlist, so
  // the element runs its own load after the effect that turned captions on and
  // comes back with every mode reset to "disabled". jsdom implements no media
  // stack at all, so the list is faked with exactly that semantic.
  function fakeTextTracks(labels: string[]) {
    const listeners: Record<string, Array<() => void>> = {};
    const tracks = labels.map((label) => ({ label, kind: "captions", language: "en", mode: "disabled" }));
    return {
      tracks,
      list: {
        get length() {
          return tracks.length;
        },
        item: (i: number) => tracks[i],
        addEventListener: (type: string, fn: () => void) => {
          (listeners[type] ??= []).push(fn);
        },
        removeEventListener: (type: string, fn: () => void) => {
          listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn);
        },
        [Symbol.iterator]: function* () {
          yield* tracks;
        },
      } as unknown as TextTrackList,
      forget: () => tracks.forEach((t) => (t.mode = "disabled")),
      emit: (type: string) => (listeners[type] ?? []).forEach((fn) => fn()),
    };
  }

  it("turns captions on by default when the user asked for it", async () => {
    const fake = fakeTextTracks(["English"]);
    vi.spyOn(HTMLMediaElement.prototype, "textTracks", "get").mockReturnValue(fake.list);
    hydratePlayerSettings({ ...DEFAULT_PLAYER_SETTINGS, captions_default: true });
    render(<Harness tracks={[{ language: "en", label: "English", url: "blob:cc" }]} />);
    // "hidden", not "showing": ON means the track is parsed and firing cuechange
    // while CaptionLayer draws the cues clear of the control bar. Only PiP hands
    // rendering back to the browser.
    await waitFor(() => expect(fake.tracks[0].mode).toBe("hidden"));
    expect(screen.getByRole("button", { name: "Captions" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("re-applies captions-on-by-default after the element's own load forgets the mode", async () => {
    const fake = fakeTextTracks(["English"]);
    vi.spyOn(HTMLMediaElement.prototype, "textTracks", "get").mockReturnValue(fake.list);
    hydratePlayerSettings({ ...DEFAULT_PLAYER_SETTINGS, captions_default: true });
    const { container } = render(<Harness tracks={[{ language: "en", label: "English", url: "blob:cc" }]} />);
    await waitFor(() => expect(fake.tracks[0].mode).toBe("hidden"));
    const video = container.querySelector("video") as HTMLVideoElement;
    // The element loads its own resource and comes back with the modes reset —
    // measured in real Safari 26.5 on the native-HLS engine, where captions
    // never came on while hls.js (whose element has no src of its own) always
    // did. One application is not enough.
    act(() => {
      fake.forget();
      fireEvent.loadedData(video);
    });
    expect(fake.tracks[0].mode).toBe("hidden");
  });

  it("does not fight a viewer who turns captions back off", async () => {
    const fake = fakeTextTracks(["English"]);
    vi.spyOn(HTMLMediaElement.prototype, "textTracks", "get").mockReturnValue(fake.list);
    hydratePlayerSettings({ ...DEFAULT_PLAYER_SETTINGS, captions_default: true });
    const { container } = render(<Harness tracks={[{ language: "en", label: "English", url: "blob:cc" }]} />);
    await waitFor(() => expect(fake.tracks[0].mode).toBe("hidden"));
    fireEvent.click(screen.getByRole("button", { name: "Captions" }));
    expect(fake.tracks[0].mode).toBe("disabled");
    act(() => {
      fireEvent.loadedData(container.querySelector("video") as HTMLVideoElement);
    });
    expect(fake.tracks[0].mode).toBe("disabled");
  });

  it("drives play/pause and reflects the media state", () => {
    const { container } = render(<Harness />);
    const video = container.querySelector("video") as HTMLVideoElement;
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    // The button label follows the element's play/pause events.
    act(() => void fireEvent(video, new Event("play")));
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
    act(() => void fireEvent(video, new Event("pause")));
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
  });

  it("opens the speed menu with the full 0.25×–4× ladder, applies a rate, relabels, and persists it", () => {
    const { container } = render(<Harness />);
    const video = container.querySelector("video") as HTMLVideoElement;
    fireEvent.click(screen.getByRole("button", { name: "Speed: 1×" }));
    const menu = screen.getByRole("menu", { name: "Playback speed" });
    // Full mined ladder, ascending, normal reads "1×" (not "Normal"). The
    // selected item's check is a decorative <svg> (no text), so textContent is
    // just the rate label.
    const items = within(menu).getAllByRole("menuitemradio");
    expect(items.map((i) => i.textContent?.trim())).toEqual([
      "0.25×", "0.5×", "0.75×", "1×", "1.25×", "1.5×", "1.75×", "2×", "2.5×", "3×", "3.5×", "4×",
    ]);
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: "4×" }));
    expect(screen.getByRole("button", { name: "Speed: 4×" })).toBeTruthy();
    expect(video.playbackRate).toBe(4);
    expect(video.defaultPlaybackRate).toBe(4);
    // The choice is remembered for the session.
    expect(window.sessionStorage.getItem("vidra.player.speed")).toBe("4");
  });

  it("restores the session's remembered speed on mount", () => {
    window.sessionStorage.setItem("vidra.player.speed", "2");
    const { container } = render(<Harness />);
    const video = container.querySelector("video") as HTMLVideoElement;
    expect(screen.getByRole("button", { name: "Speed: 2×" })).toBeTruthy();
    expect(video.playbackRate).toBe(2);
  });

  it("starts at the signed-in user's default speed (PLAY-07) when no session pick exists", () => {
    // The watch page hydrates the per-user settings; the shell reads default_speed
    // through the speed store's fallback.
    hydratePlayerSettings({ ...DEFAULT_PLAYER_SETTINGS, default_speed: 1.5 });
    const { container } = render(<Harness />);
    const video = container.querySelector("video") as HTMLVideoElement;
    expect(screen.getByRole("button", { name: "Speed: 1.5×" })).toBeTruthy();
    expect(video.playbackRate).toBe(1.5);
  });

  it("opens in theater by default (PLAY-07) when the user's theater_default is set", () => {
    hydratePlayerSettings({ ...DEFAULT_PLAYER_SETTINGS, theater_default: true });
    render(<Harness />);
    expect(
      screen.getByRole("button", { name: "Theater mode" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("shows a Theater toggle on the watch variant whose aria-pressed follows the session store", () => {
    render(<Harness />);
    const theater = screen.getByRole("button", { name: "Theater mode" });
    expect(theater.getAttribute("aria-pressed")).toBe("false");
    act(() => void fireEvent.click(theater));
    expect(window.sessionStorage.getItem("vidra.theater")).toBe("1");
    expect(screen.getByRole("button", { name: "Theater mode" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("does not render the Theater toggle on the embed variant", () => {
    render(<Harness variant="embed" />);
    expect(screen.queryByRole("button", { name: "Theater mode" })).toBeNull();
  });

  it("hides the PiP button when the browser reports no Picture-in-Picture support", () => {
    // jsdom exposes no pictureInPictureEnabled → unsupported → button hidden.
    render(<Harness />);
    expect(screen.queryByRole("button", { name: /picture-in-picture/i })).toBeNull();
  });

  it("shows the PiP button when supported, enters PiP on click, and mirrors the element events", () => {
    Object.defineProperty(document, "pictureInPictureEnabled", {
      configurable: true,
      value: true,
    });
    const requestPip = vi.fn(() => Promise.resolve({} as PictureInPictureWindow));
    (
      HTMLVideoElement.prototype as unknown as { requestPictureInPicture: () => Promise<unknown> }
    ).requestPictureInPicture = requestPip;

    const { container } = render(<Harness />);
    const video = container.querySelector("video") as HTMLVideoElement;
    const pip = screen.getByRole("button", { name: "Picture-in-picture" });
    expect(pip.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(pip);
    expect(requestPip).toHaveBeenCalledTimes(1);

    // The element entering PiP (its event) flips the button's pressed state + label.
    act(() => void fireEvent(video, new Event("enterpictureinpicture")));
    expect(screen.getByRole("button", { name: "Exit picture-in-picture" })).toBeTruthy();
    // Leaving PiP (e.g. from the browser UI) returns it.
    act(() => void fireEvent(video, new Event("leavepictureinpicture")));
    expect(screen.getByRole("button", { name: "Picture-in-picture" })).toBeTruthy();
  });

  it("wires the T shortcut to the theater toggle on the watch variant", () => {
    render(<Harness />);
    expect(
      screen.getByRole("button", { name: "Theater mode" }).getAttribute("aria-pressed"),
    ).toBe("false");
    // A document keydown (not from a form field) flips theater via the shared store.
    act(() => void fireEvent.keyDown(document.body, { key: "t" }));
    expect(window.sessionStorage.getItem("vidra.theater")).toBe("1");
    expect(
      screen.getByRole("button", { name: "Theater mode" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("wires the > shortcut to step the playback speed up the shared ladder", () => {
    const { container } = render(<Harness />);
    const video = container.querySelector("video") as HTMLVideoElement;
    act(() => void fireEvent.keyDown(document.body, { key: ">" }));
    expect(screen.getByRole("button", { name: "Speed: 1.25×" })).toBeTruthy();
    expect(video.playbackRate).toBe(1.25);
    expect(window.sessionStorage.getItem("vidra.player.speed")).toBe("1.25");
  });

  it("wires the number keys to a decile seek (5 → 50% of the duration)", () => {
    const { container } = render(<Harness />);
    const video = container.querySelector("video") as HTMLVideoElement;
    const seeks: number[] = [];
    Object.defineProperty(video, "duration", { configurable: true, get: () => 120 });
    Object.defineProperty(video, "currentTime", {
      configurable: true,
      get: () => 0,
      set: (v: number) => {
        seeks.push(v);
      },
    });
    act(() => void fireEvent.keyDown(document.body, { key: "5" }));
    expect(seeks.at(-1)).toBe(60);
  });

  it("pins the controls while paused and auto-hides ~3s after playback starts", () => {
    vi.useFakeTimers();
    try {
      const { container } = render(<Harness />);
      const video = container.querySelector("video") as HTMLVideoElement;
      const bar = screen.getByTestId("player-controls");
      // Paused on mount → controls pinned visible.
      expect(bar.className).toContain("opacity-100");
      // Playback starts → countdown → hidden (opacity only, never display).
      act(() => void fireEvent(video, new Event("play")));
      act(() => void vi.advanceTimersByTime(3000));
      expect(bar.className).toContain("opacity-0");
      expect(bar.className).toContain("pointer-events-none");
      // Pausing pins them visible again.
      act(() => void fireEvent(video, new Event("pause")));
      expect(bar.className).toContain("opacity-100");
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the autoplay end card with the next video when the media ends, and clears it on (re)start", () => {
    const { container } = render(<Harness nextVideo={NEXT_VIDEO} />);
    const video = container.querySelector("video") as HTMLVideoElement;
    // No card while playing/paused mid-clip.
    expect(screen.queryByTestId("player-end-card")).toBeNull();
    // The element ending surfaces the end card with the queued next video.
    act(() => void fireEvent(video, new Event("ended")));
    expect(screen.getByTestId("player-end-card")).toBeTruthy();
    expect(screen.getByText("Up next clip")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Play now" })).toBeTruthy();
    // Playback restarting (e.g. Replay, or a new source's loadstart) clears it.
    act(() => void fireEvent(video, new Event("play")));
    expect(screen.queryByTestId("player-end-card")).toBeNull();
  });

  it("shows the current chapter title beside the time readout and updates it as playback advances", async () => {
    vi.spyOn(api, "getVideoChapters").mockResolvedValue({
      chapters: [
        { start_seconds: 0, title: "Intro" },
        { start_seconds: 60, title: "The Build" },
      ],
    });
    const { container } = render(<Harness video={{ ...VIDEO, has_chapters: true } as Video} />);
    // currentTime starts at 0 → the first chapter's title appears once they load.
    expect(await screen.findByText("Intro")).toBeTruthy();
    // Advancing the media clock into the next chapter updates the readout.
    const el = container.querySelector("video") as HTMLVideoElement;
    Object.defineProperty(el, "currentTime", { configurable: true, get: () => 75, set: () => {} });
    act(() => void fireEvent(el, new Event("timeupdate")));
    expect(screen.getByText("The Build")).toBeTruthy();
    expect(screen.queryByText("Intro")).toBeNull();
  });

  it("shows an autoplay switch whose checked state follows the store and flips on click", () => {
    render(<Harness />);
    // Baked default is ON (serverAutoplay + unset session both read on).
    const on = screen.getByRole("switch", { name: "Autoplay next" });
    expect(on.getAttribute("aria-checked")).toBe("true");
    // A click flips the session preference the end card honours.
    fireEvent.click(on);
    const off = screen.getByRole("switch", { name: "Autoplay next" });
    expect(off.getAttribute("aria-checked")).toBe("false");
    expect(window.sessionStorage.getItem("vidra.autoplay-next")).toBe("0");
  });

  it("mirrors the autoplay change to the account when a signed-in user's settings are loaded", () => {
    const put = vi.spyOn(api, "updatePlayerSettings").mockResolvedValue(DEFAULT_PLAYER_SETTINGS);
    // A signed-in user's server-backed settings are hydrated (autoplay on).
    hydratePlayerSettings({ ...DEFAULT_PLAYER_SETTINGS, autoplay_next: true });
    render(<Harness />);
    fireEvent.click(screen.getByRole("switch", { name: "Autoplay next" }));
    // Fire-and-forget merge-PUT with just the flipped field.
    expect(put).toHaveBeenCalledWith({ autoplay_next: false });
  });

  it("does not touch the account when no signed-in settings are loaded (anonymous / unsettled)", () => {
    const put = vi.spyOn(api, "updatePlayerSettings").mockResolvedValue(DEFAULT_PLAYER_SETTINGS);
    render(<Harness />); // settings not hydrated → no account to write to
    fireEvent.click(screen.getByRole("switch", { name: "Autoplay next" }));
    expect(put).not.toHaveBeenCalled();
  });

  it("does not render the autoplay toggle on the embed variant", () => {
    render(<Harness variant="embed" />);
    expect(screen.queryByRole("switch", { name: /Autoplay/ })).toBeNull();
  });

  it("hides the chrome the instant the pointer leaves the stage while playing", () => {
    // YouTube parity, and the fourth of the owner's complaints: leaving the
    // player must take the buttons AND the timeline with it, not start a 3s
    // countdown the viewer has already walked away from.
    const { container } = render(<Harness />);
    const video = container.querySelector("video") as HTMLVideoElement;
    const bar = screen.getByTestId("player-controls");
    act(() => void fireEvent(video, new Event("play")));
    expect(bar.className).toContain("opacity-100");
    act(() => void fireEvent.pointerOut(screen.getByTestId("video-player"), {
      relatedTarget: document.body,
      pointerType: "mouse",
    }));
    expect(bar.className).toContain("opacity-0");
  });

  it("keeps the chrome up when a TOUCH pointer leaves the stage while playing", () => {
    // Touch fires pointerout/pointerleave immediately after pointerup, so on a
    // phone every tap on a control ran the mouse-leave path and hid the bar
    // mid-playback — captions, fullscreen and the seek bar became unreachable
    // by the only input the device has. Only a mouse can meaningfully "leave".
    const { container } = render(<Harness />);
    const video = container.querySelector("video") as HTMLVideoElement;
    const bar = screen.getByTestId("player-controls");
    act(() => void fireEvent(video, new Event("play")));
    const stage = screen.getByTestId("video-player");
    act(() => void fireEvent.pointerOut(stage, {
      relatedTarget: document.body,
      pointerType: "touch",
    }));
    expect(bar.className).toContain("opacity-100");
    // ...and a pen behaves like touch, not like a mouse.
    act(() => void fireEvent.pointerOut(stage, {
      relatedTarget: document.body,
      pointerType: "pen",
    }));
    expect(bar.className).toContain("opacity-100");
  });

  it("keeps the chrome up when the pointer leaves while paused", () => {
    // Paused is the one state where the chrome is the point: a paused player
    // with no visible controls reads as broken.
    render(<Harness />);
    const bar = screen.getByTestId("player-controls");
    act(() => void fireEvent.pointerOut(screen.getByTestId("video-player"), {
      relatedTarget: document.body,
      pointerType: "mouse",
    }));
    expect(bar.className).toContain("opacity-100");
  });

  it("shows ONE tooltip above the transport, naming the control and its shortcut", () => {
    render(<Harness tracks={CC_TRACKS} />);
    const cc = screen.getByRole("button", { name: "Captions" });
    // Keyboard focus shows it at once (no hover dwell to wait out).
    act(() => void fireEvent.focus(cc));
    const tip = screen.getByTestId("player-tooltip");
    expect(tip.textContent).toContain("Subtitles/closed captions");
    const cap = within(tip).getByText("C");
    expect(cap.tagName).toBe("KBD");
    // One bubble for the whole bar, never one per control.
    expect(screen.getAllByTestId("player-tooltip")).toHaveLength(1);
    act(() => void fireEvent.blur(cc));
    expect(screen.queryByTestId("player-tooltip")).toBeNull();
  });

  it("re-labels the open tooltip when the hovered control's own label changes", () => {
    // Pressing K while the pointer rests on Play used to leave "Play" hanging
    // over a button that now pauses: the bubble snapshotted its text at show().
    const { container } = render(<Harness />);
    const video = container.querySelector("video") as HTMLVideoElement;
    const play = screen.getByRole("button", { name: "Play" });
    act(() => void fireEvent.focus(play));
    expect(screen.getByTestId("player-tooltip").textContent).toContain("Play");
    act(() => void fireEvent(video, new Event("play")));
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
    expect(screen.getByTestId("player-tooltip").textContent).toContain("Pause");
  });

  it("shows a replay-only end card (no next) when there is nothing queued", () => {
    const { container } = render(<Harness />);
    const video = container.querySelector("video") as HTMLVideoElement;
    act(() => void fireEvent(video, new Event("ended")));
    expect(screen.getByTestId("player-end-card")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Play now" })).toBeNull();
    expect(screen.getByRole("button", { name: "Replay" })).toBeTruthy();
    // A new source (navigation / fallback) clears any stale end card.
    act(() => void fireEvent(video, new Event("loadstart")));
    expect(screen.queryByTestId("player-end-card")).toBeNull();
  });

  // ---- app-rendered captions (the cue must clear the control bar) ----
  //
  // jsdom implements no media stack, so textTracks is faked — with the two
  // behaviours a real browser gives us and this layer depends on: setting a
  // track's `mode` fires `change` on the LIST, and a track in `hidden` mode
  // still fires `cuechange` carrying its active cues.
  function fakeCaptionTracks(count = 1) {
    const listListeners: Record<string, Array<() => void>> = {};
    const emit = (type: string) => (listListeners[type] ?? []).forEach((fn) => fn());
    const tracks = Array.from({ length: count }, (_, i) => {
      const cueListeners: Array<() => void> = [];
      let mode = "disabled";
      const track = {
        kind: "captions",
        language: `l${i}`,
        label: `Track ${i}`,
        activeCues: null as unknown as TextTrackCueList | null,
        get mode() {
          return mode;
        },
        set mode(next: string) {
          if (next === mode) return;
          mode = next;
          emit("change");
        },
        addEventListener: (type: string, fn: () => void) => {
          if (type === "cuechange") cueListeners.push(fn);
        },
        removeEventListener: (type: string, fn: () => void) => {
          const at = cueListeners.indexOf(fn);
          if (at >= 0) cueListeners.splice(at, 1);
        },
        /** Test-only: play (or clear, with null) a cue on this track. */
        cue(text: string | null) {
          track.activeCues = (
            text === null ? [] : [{ startTime: 0, endTime: 1, text, id: "" }]
          ) as unknown as TextTrackCueList;
          cueListeners.forEach((fn) => fn());
        },
      };
      return track;
    });
    const list = {
      get length() {
        return tracks.length;
      },
      item: (i: number) => tracks[i],
      addEventListener: (type: string, fn: () => void) => {
        (listListeners[type] ??= []).push(fn);
      },
      removeEventListener: (type: string, fn: () => void) => {
        listListeners[type] = (listListeners[type] ?? []).filter((f) => f !== fn);
      },
      [Symbol.iterator]: function* () {
        yield* tracks;
      },
    };
    return { tracks, list: list as unknown as TextTrackList };
  }

  const CC_TRACKS: CaptionTrack[] = [{ language: "l0", label: "Track 0", url: "blob:cc" }];

  function installTracks(count = 1) {
    const fake = fakeCaptionTracks(count);
    vi.spyOn(HTMLMediaElement.prototype, "textTracks", "get").mockReturnValue(fake.list);
    return fake;
  }

  it("draws the active cues itself, with the track kept out of the browser's own renderer", () => {
    const fake = installTracks();
    render(<Harness tracks={CC_TRACKS} />);

    act(() => void fireEvent.click(screen.getByRole("button", { name: "Captions" })));
    // NOT "showing": a natively drawn cue is positioned at the bottom of the
    // video element with no knowledge of our overlaid bar, which is how caption
    // text ended up behind the transport row. hidden = parsed, ours to draw.
    expect(fake.tracks[0].mode).toBe("hidden");
    expect(screen.getByRole("button", { name: "Captions" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.queryByTestId("player-caption-cue")).toBeNull();

    act(() => void fake.tracks[0].cue("Cue from the fixture"));
    expect(screen.getByTestId("player-caption-cue").textContent).toBe("Cue from the fixture");
    // Decoration over the real, accessible control — assistive tech is not
    // exposed to native cues either.
    expect(screen.getByTestId("player-captions").getAttribute("aria-hidden")).toBe("true");
  });

  it("clears the drawn cues when captions are switched off", () => {
    const fake = installTracks();
    render(<Harness tracks={CC_TRACKS} />);
    act(() => void fireEvent.click(screen.getByRole("button", { name: "Captions" })));
    act(() => void fake.tracks[0].cue("Still on screen"));
    expect(screen.getByTestId("player-caption-cue")).toBeTruthy();

    act(() => void fireEvent.click(screen.getByRole("button", { name: "Captions" })));

    expect(fake.tracks[0].mode).toBe("disabled");
    expect(screen.queryByTestId("player-caption-cue")).toBeNull();
  });

  it("follows a switch to another track instead of stranding the old track's cue", () => {
    const fake = installTracks(2);
    render(<Harness tracks={CC_TRACKS} />);
    act(() => void fireEvent.click(screen.getByRole("button", { name: "Captions" })));
    act(() => void fake.tracks[0].cue("English"));
    expect(screen.getByTestId("player-caption-cue").textContent).toBe("English");

    // The selection moves to the second track (a language pick, or an engine
    // swapping the list): the first track's cue must not survive it.
    act(() => {
      fake.tracks[0].mode = "disabled";
      fake.tracks[1].mode = "hidden";
    });
    expect(screen.queryByTestId("player-caption-cue")).toBeNull();

    act(() => void fake.tracks[1].cue("Français"));
    expect(screen.getByTestId("player-caption-cue").textContent).toBe("Français");
  });

  it("hands captions back to the browser in picture-in-picture, and takes them back on exit", () => {
    const fake = installTracks();
    const { container } = render(<Harness tracks={CC_TRACKS} />);
    const video = container.querySelector("video") as HTMLVideoElement;
    act(() => void fireEvent.click(screen.getByRole("button", { name: "Captions" })));
    act(() => void fake.tracks[0].cue("In the stage"));
    expect(screen.getByTestId("player-caption-cue")).toBeTruthy();

    // The PiP window is the browser's surface; our overlay cannot follow the
    // video into it, so the browser has to draw the cues there.
    act(() => void fireEvent(video, new Event("enterpictureinpicture")));
    expect(fake.tracks[0].mode).toBe("showing");
    expect(screen.queryByTestId("player-caption-cue")).toBeNull();
    // Captions are still ON — only the renderer changed hands.
    expect(screen.getByRole("button", { name: "Captions" }).getAttribute("aria-pressed")).toBe(
      "true",
    );

    act(() => void fireEvent(video, new Event("leavepictureinpicture")));
    expect(fake.tracks[0].mode).toBe("hidden");
    act(() => void fake.tracks[0].cue("Back in the stage"));
    expect(screen.getByTestId("player-caption-cue").textContent).toBe("Back in the stage");
  });

  it("lifts the cue above the MEASURED control bar, and settles it into the title-safe band when the chrome hides", () => {
    // jsdom has no layout: give the stage and the bar a size so the inset math
    // is exercised rather than collapsing to the floor.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      const id = this.dataset.testid;
      const height = id === "video-player" ? 360 : id === "player-controls" ? 96 : 0;
      return { height, width: 640, top: 0, left: 0, right: 640, bottom: height } as DOMRect;
    });
    vi.useFakeTimers();
    try {
      const fake = installTracks();
      const { container } = render(<Harness tracks={CC_TRACKS} />);
      const video = container.querySelector("video") as HTMLVideoElement;
      act(() => void fireEvent.click(screen.getByRole("button", { name: "Captions" })));
      act(() => void fake.tracks[0].cue("Above the bar"));

      // Paused on mount → the chrome is pinned up → the cue clears the 96px bar.
      const layer = screen.getByTestId("player-captions");
      expect(layer.getAttribute("data-controls")).toBe("visible");
      expect(layer.style.bottom).toBe("110px"); // 96 bar + 14 gap

      // Playback starts, the chrome auto-hides → the cue drops to the title-safe
      // band (6% of a 360px stage = 21.6px, floored at 24px), never to the edge.
      act(() => void fireEvent(video, new Event("play")));
      act(() => void vi.advanceTimersByTime(3000));
      expect(layer.getAttribute("data-controls")).toBe("hidden");
      expect(layer.style.bottom).toBe("24px");

      // ...and back up the moment the chrome returns, on the bar's own motion
      // token (transition-[bottom] inherits the same duration/easing).
      act(() => void fireEvent(video, new Event("pause")));
      expect(layer.style.bottom).toBe("110px");
      expect(layer.className).toContain("transition-[bottom]");
    } finally {
      vi.useRealTimers();
    }
  });
});

// The transport control is the only readout a viewer has for "is this playing?",
// and the media element can leave playback WITHOUT firing `pause`. Owner report:
// "if the video isn't autoplaying, the play button shows up as a pause button —
// when clicking into the video, but not when using a link to watch it."
describe("VideoPlayer transport ↔ element sync", () => {
  it("follows the element out of playback when the load algorithm silently re-pauses it", async () => {
    const { container } = render(<Harness />);
    const video = container.querySelector("video") as HTMLVideoElement;

    // jsdom's `paused` is a fixed getter; make it settable so this test can model
    // the spec behaviour exactly.
    let paused = true;
    Object.defineProperty(video, "paused", { configurable: true, get: () => paused });

    // 1. Playback begins (a click, or the start-on-open kick).
    await act(async () => {
      paused = false;
      video.dispatchEvent(new Event("play"));
    });
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();

    // 2. The engine re-attaches: hls.js `destroy()`/`detachMedia` does
    //    removeAttribute("src") + load(), and the HLS→original fallback re-points
    //    src. The media element load algorithm sets `paused` back to true and
    //    rejects the pending play promise — firing abort + emptied + loadstart,
    //    NEVER `pause`. Only play/pause wrote React's state, so it stayed false.
    await act(async () => {
      paused = true;
      video.dispatchEvent(new Event("abort"));
      video.dispatchEvent(new Event("emptied"));
      video.dispatchEvent(new Event("loadstart"));
    });

    expect(video.paused).toBe(true);
    expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
  });
});

// Start-on-open (config-parity W5) fires from an effect that used to run on the
// FIRST render. On an SPA feed→watch navigation the defaults store and the
// per-user layer are already settled by then, so the kick landed on an element
// the engine had not attached anything to yet — and the attach that followed
// aborted it. The video never started and the latch was already spent.
describe("VideoPlayer start-on-open", () => {
  const HLS_VIDEO = {
    ...VIDEO,
    hls_url: "/api/v1/videos/v1/hls/master.m3u8",
  } as unknown as Video;

  beforeEach(() => {
    // The operator seeds start-on-open; the per-user layer is settled (the shared
    // afterEach's resetPlayerSettings leaves it that way), so readStartOnOpen()
    // is already true on the first render — the SPA-navigation ordering.
    setInstanceDefaultsForTests({ player_autoplay: true });
  });

  afterEach(() => {
    setInstanceDefaultsForTests(null);
    Reflect.deleteProperty(window, "MediaSource");
  });

  it("holds the kick until the engine has attached a source, then starts exactly once", async () => {
    // MSE present ⇒ hls.js wins selection provisionally and owns the element, so
    // the shell renders <video> with NO src until the dynamic import resolves.
    Object.defineProperty(window, "MediaSource", { configurable: true, value: class {} });
    const play = vi.mocked(HTMLMediaElement.prototype.play);

    const { container } = render(<Harness video={HLS_VIDEO} />);
    const video = container.querySelector("video") as HTMLVideoElement;

    expect(video.getAttribute("src")).toBeNull();
    expect(play).not.toHaveBeenCalled(); // nothing to play yet — do not fake it

    // hls.js declines, the shell walks down to the progressive original: a source
    // now exists, so the kick lands.
    await waitFor(() => expect(video.getAttribute("src")).toBeTruthy());
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
  });

  it("re-arms and re-kicks when an engine re-attach aborts the pending play", async () => {
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    let rejectPlay: (reason: unknown) => void = () => {};
    play.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectPlay = reject;
        }),
    );

    const { container } = render(<Harness />);
    const video = container.querySelector("video") as HTMLVideoElement;
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));

    // The load algorithm interrupts it: AbortError, then abort/emptied/loadstart.
    await act(async () => {
      rejectPlay(Object.assign(new Error("interrupted by a new load"), { name: "AbortError" }));
      await Promise.resolve();
    });
    await act(async () => {
      video.dispatchEvent(new Event("abort"));
      video.dispatchEvent(new Event("emptied"));
      video.dispatchEvent(new Event("loadstart"));
    });

    expect(play).toHaveBeenCalledTimes(2);
  });

  // REVIEW (PR #235): the internal PAUSE steps reject a pending play promise with
  // AbortError too — the same name a load abort produces. So the rejection alone
  // cannot tell "the engine re-attached" from "the viewer pressed pause while it
  // was still buffering", and re-arming on it fought exactly the viewer the
  // latch exists to protect. Intent is tracked at the control, not guessed from
  // the error.
  it("does not fight a viewer who pauses the kick while it is still buffering", async () => {
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    let rejectPlay: (reason: unknown) => void = () => {};
    play.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectPlay = reject;
        }),
    );

    const { container } = render(<Harness />);
    const video = container.querySelector("video") as HTMLVideoElement;
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));

    // The element has left the paused state and is buffering. jsdom's `paused`
    // is a fixed getter; make it answer like the spec does.
    let paused = false;
    Object.defineProperty(video, "paused", { configurable: true, get: () => paused });
    await act(async () => {
      video.dispatchEvent(new Event("play"));
    });

    // The viewer presses pause. The bar button, the stage click and K/space all
    // route through togglePlay, so pressing the button exercises all three.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Pause" }));
      paused = true;
      // pause() runs the internal pause steps: the pending play promise is
      // rejected with AbortError, and `pause` fires.
      rejectPlay(Object.assign(new Error("interrupted by pause"), { name: "AbortError" }));
      await Promise.resolve();
      video.dispatchEvent(new Event("pause"));
    });

    // Now the engine re-attaches anyway (the HLS→original fallback). The video
    // must stay stopped: the viewer answered this question already.
    await act(async () => {
      video.dispatchEvent(new Event("abort"));
      video.dispatchEvent(new Event("emptied"));
      video.dispatchEvent(new Event("loadstart"));
    });

    expect(play).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
  });

  // REVIEW (PR #235): whether a browser fires `play` before refusing is
  // browser-dependent. Where it does, no `pause` follows and no further
  // loadstart arrives, so the rejection is the only place left to correct
  // React's idea of the element.
  it("resyncs the transport when the kick is refused after the element already said play", async () => {
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    let rejectPlay: (reason: unknown) => void = () => {};
    play.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectPlay = reject;
        }),
    );

    const { container } = render(<Harness />);
    const video = container.querySelector("video") as HTMLVideoElement;
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));

    let paused = false;
    Object.defineProperty(video, "paused", { configurable: true, get: () => paused });
    await act(async () => {
      video.dispatchEvent(new Event("play"));
    });
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();

    await act(async () => {
      paused = true;
      rejectPlay(Object.assign(new Error("gesture required"), { name: "NotAllowedError" }));
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
  });

  // REVIEW (PR #235): a `?t=` deep link moves the head before anything has
  // played. currentTime is where the head IS, not evidence that a viewer
  // watched — `played` is that evidence.
  it("re-arms after an abort even when a ?t= deep link moved the head", async () => {
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    let rejectPlay: (reason: unknown) => void = () => {};
    play.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectPlay = reject;
        }),
    );

    const { container } = render(<Harness />);
    const video = container.querySelector("video") as HTMLVideoElement;
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));

    video.currentTime = 7; // the #t= fragment landed; played is still empty
    await act(async () => {
      rejectPlay(Object.assign(new Error("interrupted by a new load"), { name: "AbortError" }));
      await Promise.resolve();
    });
    await act(async () => {
      video.dispatchEvent(new Event("abort"));
      video.dispatchEvent(new Event("emptied"));
      video.dispatchEvent(new Event("loadstart"));
    });

    expect(play).toHaveBeenCalledTimes(2);
  });

  it("does not re-kick a play the browser's autoplay policy refused", async () => {
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    play.mockImplementationOnce(() =>
      Promise.reject(Object.assign(new Error("gesture required"), { name: "NotAllowedError" })),
    );

    const { container } = render(<Harness />);
    const video = container.querySelector("video") as HTMLVideoElement;
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));

    // Same re-attach, but the refusal was the browser's policy, not a load. A
    // re-kick here would be refused again on every attach and flicker the label.
    await act(async () => {
      await Promise.resolve();
      video.dispatchEvent(new Event("abort"));
      video.dispatchEvent(new Event("emptied"));
      video.dispatchEvent(new Event("loadstart"));
    });

    expect(play).toHaveBeenCalledTimes(1);
  });
});
