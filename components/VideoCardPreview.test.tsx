// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storyboardState = vi.hoisted(() => ({
  current: null as null | {
    cueAt: ReturnType<typeof vi.fn>;
    spriteUrl: string;
    activate: ReturnType<typeof vi.fn>;
  },
}));

const apiMocks = vi.hoisted(() => ({
  getCaptions: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: { href: string; children: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/use-storyboard", () => ({
  useStoryboard: () => storyboardState.current,
}));

vi.mock("@/lib/api", () => ({
  api: { getCaptions: apiMocks.getCaptions },
  videoCaptionUrl: (id: string, language: string) =>
    `http://api.test/api/v1/videos/${id}/captions/${language}`,
}));

import { VideoCardPreview, type VideoCardPreviewProps } from "./VideoCardPreview";
import { VIDEO_CARD_PREVIEW_AUDIO_KEY } from "@/lib/video-card-preview-session";

const BASE_PROPS: VideoCardPreviewProps = {
  videoId: "v1",
  title: "A previewable video",
  href: "/videos/v1",
  src: "/video.mp4",
  poster: "/poster.jpg",
  duration: 120,
  previewEnabled: true,
  hoverDelayMs: 50,
  captions: [],
};

function renderPreview(overrides: Partial<VideoCardPreviewProps> = {}) {
  return render(<VideoCardPreview {...BASE_PROPS} {...overrides} />);
}

function hoverUntilActive() {
  fireEvent.pointerEnter(screen.getByTestId("video-card-preview"), { pointerType: "mouse" });
  act(() => vi.advanceTimersByTime(50));
  return screen.getByTestId("video-card-preview-media") as HTMLVideoElement;
}

beforeEach(() => {
  vi.useFakeTimers();
  window.sessionStorage.clear();
  storyboardState.current = null;
  apiMocks.getCaptions.mockReset();
  apiMocks.getCaptions.mockResolvedValue({ captions: [] });
  Reflect.deleteProperty(navigator, "connection");
  Object.defineProperty(window.URL, "createObjectURL", {
    configurable: true,
    writable: true,
    value: vi.fn(() => "blob:preview-caption"),
  });
  Object.defineProperty(window.URL, "revokeObjectURL", {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
  class TestPointerEvent extends window.MouseEvent {
    readonly pointerType: string;
    readonly pointerId: number;

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerType = init.pointerType ?? "";
      this.pointerId = init.pointerId ?? 1;
    }
  }
  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    writable: true,
    value: TestPointerEvent,
  });
  vi.spyOn(window.HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
  vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("VideoCardPreview", () => {
  it("marks an above-the-fold poster eager and high priority", () => {
    const { container } = renderPreview({ posterPriority: true });
    const poster = container.querySelector('img[src="/poster.jpg"]');
    expect(poster?.getAttribute("loading")).toBe("eager");
    expect(poster?.getAttribute("fetchpriority")).toBe("high");
  });

  it("waits for deliberate hover, cancels incidental hover, and restores the poster on leave", () => {
    const { container } = renderPreview();
    const surface = screen.getByTestId("video-card-preview");

    expect(screen.getByRole("link", { name: "A previewable video" }).getAttribute("href")).toBe(
      "/videos/v1",
    );
    expect(screen.queryByTestId("video-card-preview-media")).toBeNull();
    expect(container.querySelector('img[src="/poster.jpg"]')).not.toBeNull();

    fireEvent.pointerEnter(surface, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(49));
    expect(screen.queryByTestId("video-card-preview-media")).toBeNull();
    fireEvent.pointerLeave(surface);
    act(() => vi.advanceTimersByTime(100));
    expect(screen.queryByTestId("video-card-preview-media")).toBeNull();

    const media = hoverUntilActive();
    expect(media.muted).toBe(true);
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /play/i })).toBeNull();

    fireEvent.pointerLeave(surface);
    expect(window.HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("video-card-preview-media")).toBeNull();
    expect(surface.getAttribute("data-preview-active")).toBe("false");
  });

  it("never loads preview media when policy disables it or the pointer is touch", () => {
    const { rerender } = renderPreview({ previewEnabled: false });
    const surface = screen.getByTestId("video-card-preview");

    fireEvent.pointerEnter(surface, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(100));
    expect(screen.queryByTestId("video-card-preview-media")).toBeNull();

    rerender(<VideoCardPreview {...BASE_PROPS} />);
    fireEvent.pointerEnter(surface, { pointerType: "touch" });
    act(() => vi.advanceTimersByTime(100));
    expect(screen.queryByTestId("video-card-preview-media")).toBeNull();
  });

  it("keeps optional preview media off Save-Data connections", () => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { saveData: true, effectiveType: "4g" },
    });
    renderPreview();

    fireEvent.pointerEnter(screen.getByTestId("video-card-preview"), { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(100));
    expect(screen.queryByTestId("video-card-preview-media")).toBeNull();
  });

  it("starts muted with captions and remembers an explicit unmute across cards for the session", () => {
    const captions = [{ language: "en", label: "English", src: "/captions/en.vtt" }];
    const first = renderPreview({ captions });
    const firstMedia = hoverUntilActive();
    const firstTrack = firstMedia.querySelector("track") as HTMLTrackElement;

    expect(firstMedia.muted).toBe(true);
    expect(firstTrack.default).toBe(true);
    expect(screen.getByRole("button", { name: "Hide preview captions" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Unmute preview" }).hasAttribute("aria-pressed"))
      .toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Unmute preview" }));
    expect(window.sessionStorage.getItem(VIDEO_CARD_PREVIEW_AUDIO_KEY)).toBe("audible");
    expect(firstMedia.muted).toBe(false);
    expect(firstTrack.default).toBe(false);
    expect(screen.getByRole("button", { name: "Show preview captions" })).toBeTruthy();

    first.unmount();
    renderPreview({ captions });
    const nextMedia = hoverUntilActive();
    expect(nextMedia.muted).toBe(false);
    expect(screen.getByRole("button", { name: "Mute preview" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show preview captions" })).toBeTruthy();
  });

  it("restores the caption default whenever the audio mode changes", () => {
    const captions = [{ language: "en", label: "English", src: "/captions/en.vtt" }];
    renderPreview({ captions });
    hoverUntilActive();

    fireEvent.click(screen.getByRole("button", { name: "Hide preview captions" }));
    expect(screen.getByRole("button", { name: "Show preview captions" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Unmute preview" }));
    expect(screen.getByRole("button", { name: "Show preview captions" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mute preview" }));
    expect(screen.getByRole("button", { name: "Hide preview captions" })).toBeTruthy();
  });

  it("discovers and blob-loads the first caption only after preview activation", async () => {
    apiMocks.getCaptions.mockResolvedValue({
      captions: [
        { language: "en", label: "English", created_at: "2026-07-13T00:00:00Z" },
        { language: "fr", label: "French", created_at: "2026-07-13T00:00:00Z" },
      ],
    });
    const captionFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("WEBVTT\n\n00:00.000 --> 00:01.000\nHello"),
    });
    vi.stubGlobal("fetch", captionFetch);
    const view = renderPreview({ captions: undefined });

    expect(apiMocks.getCaptions).not.toHaveBeenCalled();
    hoverUntilActive();
    await act(async () => {
      // Caption list -> VTT text -> blob URL -> React state.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(apiMocks.getCaptions).toHaveBeenCalledTimes(1);
    expect(captionFetch).toHaveBeenCalledTimes(1);
    expect(captionFetch.mock.calls[0][0]).toBe(
      "http://api.test/api/v1/videos/v1/captions/en",
    );
    const track = screen.getByTestId("video-card-preview-media").querySelector("track");
    expect(track?.getAttribute("src")).toBe("blob:preview-caption");
    expect(track?.getAttribute("srclang")).toBe("en");
    expect((track as HTMLTrackElement | null)?.default).toBe(true);
    expect(window.URL.createObjectURL).toHaveBeenCalledTimes(1);

    view.unmount();
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-caption");
  });

  it("seeks inside the card and shows the exact hovered time without faking a storyboard", () => {
    const parentClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <VideoCardPreview {...BASE_PROPS} />
      </div>,
    );
    const media = hoverUntilActive();
    const timeline = screen.getByRole("slider", { name: "Preview timeline" });
    vi.spyOn(timeline, "getBoundingClientRect").mockReturnValue({
      x: 10,
      y: 0,
      left: 10,
      top: 0,
      right: 210,
      bottom: 36,
      width: 200,
      height: 36,
      toJSON: () => ({}),
    });

    fireEvent.pointerMove(timeline, { clientX: 110, pointerType: "mouse" });
    expect(screen.getByText("1:00")).toBeTruthy();
    expect(screen.queryByTestId("video-card-preview-storyboard")).toBeNull();

    fireEvent.pointerDown(timeline, { clientX: 160, pointerType: "mouse", button: 0 });
    expect(media.currentTime).toBe(90);
    expect(timeline.getAttribute("aria-valuenow")).toBe("90");
    fireEvent.click(timeline);
    expect(parentClick).not.toHaveBeenCalled();
  });

  it("uses the exact storyboard tile under the timeline pointer when one is available", () => {
    const activate = vi.fn();
    const cueAt = vi.fn(() => ({ start: 50, end: 70, x: 160, y: 90, w: 160, h: 90 }));
    storyboardState.current = {
      activate,
      cueAt,
      spriteUrl: "/storyboard.jpg",
    };
    renderPreview({ hasStoryboard: true });
    hoverUntilActive();
    const timeline = screen.getByRole("slider", { name: "Preview timeline" });
    vi.spyOn(timeline, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 200,
      bottom: 36,
      width: 200,
      height: 36,
      toJSON: () => ({}),
    });

    fireEvent.pointerMove(timeline, { clientX: 100, pointerType: "mouse" });
    expect(activate).toHaveBeenCalled();
    expect(cueAt).toHaveBeenCalledWith(60);
    const tile = screen.getByTestId("video-card-preview-storyboard");
    expect(tile.style.backgroundImage).toContain("/storyboard.jpg");
    expect(tile.style.backgroundPosition).toBe("-160px -90px");
  });

  it("supports keyboard seeking without bubbling a card activation", () => {
    const parentKeyDown = vi.fn();
    render(
      <div onKeyDown={parentKeyDown}>
        <VideoCardPreview {...BASE_PROPS} />
      </div>,
    );
    const media = hoverUntilActive();
    media.currentTime = 20;
    fireEvent.timeUpdate(media);
    const timeline = screen.getByRole("slider", { name: "Preview timeline" });

    fireEvent.keyDown(timeline, { key: "ArrowRight" });
    expect(media.currentTime).toBe(25);
    expect(parentKeyDown).not.toHaveBeenCalled();
  });

  it("activates from keyboard focus and stays mounted while focus moves through its controls", () => {
    render(
      <div>
        <VideoCardPreview {...BASE_PROPS} />
        <button type="button">Outside</button>
      </div>,
    );
    const surface = screen.getByTestId("video-card-preview");
    fireEvent.focus(screen.getByRole("link", { name: "A previewable video" }));
    expect(screen.getByTestId("video-card-preview-media")).toBeTruthy();

    act(() => screen.getByRole("slider", { name: "Preview timeline" }).focus());
    fireEvent.pointerLeave(surface, { pointerType: "mouse" });
    expect(screen.getByTestId("video-card-preview-media")).toBeTruthy();

    act(() => screen.getByRole("button", { name: "Outside" }).focus());
    expect(screen.queryByTestId("video-card-preview-media")).toBeNull();
  });
});
