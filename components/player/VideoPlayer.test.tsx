// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VideoPlayer, type CaptionTrack } from "./VideoPlayer";
import { api, type Video } from "@/lib/api";
import {
  DEFAULT_PLAYER_SETTINGS,
  hydratePlayerSettings,
  resetPlayerSettings,
} from "@/lib/player-settings";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

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
});
