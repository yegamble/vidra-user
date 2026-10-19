// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, type ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Video } from "@/lib/api";
import type { VastDocument } from "@/lib/vast";
import { resetPlayerSettings } from "@/lib/player-settings";
import { VideoPlayer } from "./VideoPlayer";
const mocks = vi.hoisted(() => ({ loadVast: vi.fn(), trackVast: vi.fn(), markVastPlayed: vi.fn(), engine: vi.fn(),
  onPlay: vi.fn(), onPause: vi.fn(), onTimeUpdate: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {} }) }));
vi.mock("@/lib/instance-defaults", async original => ({ ...await original<typeof import("@/lib/instance-defaults")>(), primeInstanceDefaults() {} }));
vi.mock("@/lib/vast-client", () => ({ loadVast: mocks.loadVast, trackVast: mocks.trackVast }));
vi.mock("@/lib/vast-cooldown", () => ({ canPlayVast: () => true, markVastPlayed: mocks.markVastPlayed }));
vi.mock("@/lib/use-playback-engine", () => ({ useHlsPlayback: (...args: unknown[]) => {
  mocks.engine(...args);
  return { src: args[6] ? undefined : "/content.mp4", mode: "progressive", levels: [],
    audioTracks: [], setAudioTrack() {}, currentAudioTrack: "", currentQuality: "auto", setQuality() {}, retry() {} };
} }));
const VIDEO = { id: "one", title: "Content", privacy: "public", state: "published" } as Video;
const AD: VastDocument = { mediaUrl: "https://ads.test/ad.mp4", duration: 10, skipAfter: null,
  impressions: [], errors: [], tracking: {}, clickTracking: [] };
type Options = Pick<ComponentProps<typeof VideoPlayer>, "adBreaks" | "variant" | "autoplay">;
function Harness(props: Options) {
  const ref = useRef<HTMLVideoElement | null>(null);
  return <VideoPlayer video={VIDEO} videoRef={ref} startAt={null} {...props}
    onPlay={mocks.onPlay} onPause={mocks.onPause} onTimeUpdate={mocks.onTimeUpdate} />;
}
it("advertises API transport readiness before preroll loads content metadata", () => {
  const { container } = render(<Harness variant="embed" adBreaks={{ before: "/tag.xml" }} />);
  const content = container.querySelector("video")!;
  expect(content.readyState).toBe(0);
  expect(content.dataset.adTransportReady).toBe("true");
  expect(mocks.loadVast).not.toHaveBeenCalled();
});
let resolveAd: (ad: VastDocument | null) => void;
beforeEach(() => {
  vi.useFakeTimers(); localStorage.clear();
  mocks.loadVast.mockImplementation(() => new Promise(resolve => { resolveAd = resolve; }));
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, "paused", { configurable: true, value: false });
    this.dispatchEvent(new Event("play")); return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, "paused", { configurable: true, value: true });
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); vi.useRealTimers(); resetPlayerSettings();
  Reflect.deleteProperty(document, "pictureInPictureElement"); Reflect.deleteProperty(document, "exitPictureInPicture"); });
const content = () => screen.getByTestId("content-video") as HTMLVideoElement;
const adMedia = () => screen.getByRole("region", { name: "Advertisement" }).querySelector("video")!;
const deliver = () => act(async () => { resolveAd(AD); });

it("keeps default playback unchanged, without an ad fetch or extra media element", () => {
  const { container } = render(<Harness />);
  expect(content().getAttribute("src")).toBe("/content.mp4");
  expect(container.querySelectorAll("video")).toHaveLength(1); expect(mocks.loadVast).not.toHaveBeenCalled();
});

it("isolates native external play and ad events from content history until handoff", async () => {
  render(<Harness adBreaks={{ before: "/vast" }} />);
  const video = content(); expect(video.hasAttribute("src")).toBe(false);
  expect(screen.queryByRole("status", { name: "Loading video" })).toBeNull();
  video.currentTime = 75; act(() => { void video.play(); });
  fireEvent.pause(video); // the browser queues the gate's internal pause event
  fireEvent.timeUpdate(video);
  expect(video.paused).toBe(true); expect(mocks.onPlay).not.toHaveBeenCalled();
  expect(mocks.onPause).not.toHaveBeenCalled(); expect(mocks.onTimeUpdate).not.toHaveBeenCalled();
  await deliver(); const ad = adMedia(); fireEvent.playing(ad); ad.currentTime = 5; fireEvent.timeUpdate(ad);
  expect(mocks.markVastPlayed).toHaveBeenCalledOnce(); expect(mocks.onPlay).not.toHaveBeenCalled();
  expect(mocks.onTimeUpdate).not.toHaveBeenCalled(); expect(screen.queryByTestId("player-end-card")).toBeNull();
  fireEvent.ended(ad); expect(content()).toBe(video); expect(video.getAttribute("src")).toBe("/content.mp4");
  video.currentTime = 0; fireEvent.loadStart(video); fireEvent.loadedMetadata(video);
  expect(video.currentTime).toBe(75); expect(mocks.onPlay).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(screen.getByTestId("video-player"));
  fireEvent.ended(video); expect(screen.getByTestId("player-end-card")).toBeTruthy();
});

it("makes content inert during ads, blocks global seeking, and inherits content sound", async () => {
  render(<Harness adBreaks={{ before: "/vast" }} />);
  const video = content(); video.volume = 0.25; video.muted = true; fireEvent.volumeChange(video);
  fireEvent.click(screen.getByRole("button", { name: "Play" })); await deliver();
  const ad = adMedia(); expect(ad.volume).toBe(0.25); expect(ad.muted).toBe(true);
  expect(screen.getByTestId("player-content").hasAttribute("inert")).toBe(true);
  expect(screen.getByTestId("player-content").getAttribute("aria-hidden")).toBe("true");
  expect(document.activeElement?.getAttribute("aria-label")).toBe("Play advertisement");
  const calls = vi.mocked(video.play).mock.calls.length;
  for (const key of ["j", "5", " "]) fireEvent.keyDown(document.body, { key });
  expect(video.currentTime).toBe(0); expect(vi.mocked(video.play).mock.calls).toHaveLength(calls);
});

it("holds explicit embed autoplay through pending config and starts the ad before content", async () => {
  const view = render(<Harness variant="embed" autoplay adBreaks={{ pending: true }} />);
  expect(content().hasAttribute("src")).toBe(false); expect(mocks.loadVast).not.toHaveBeenCalled();
  view.rerender(<Harness variant="embed" autoplay adBreaks={{ before: "/vast" }} />);
  expect(mocks.loadVast).toHaveBeenCalledOnce(); await deliver();
  expect(adMedia()).toBeTruthy(); expect(mocks.onPlay).not.toHaveBeenCalled();
});

it("renders mid/post ads without an early end card and releases the real content end afterward", async () => {
  render(<Harness adBreaks={{ mid: "/mid", midAt: 60, after: "/after" }} />);
  const video = content(); Object.defineProperty(video, "duration", { value: 120 });
  act(() => { void video.play(); }); video.currentTime = 60; fireEvent.timeUpdate(video); await deliver();
  expect(video.paused).toBe(true); fireEvent.ended(adMedia()); expect(video.paused).toBe(false);
  expect(screen.queryByTestId("player-end-card")).toBeNull();
  fireEvent.ended(video); expect(screen.queryByTestId("player-end-card")).toBeNull(); await deliver();
  expect(mocks.loadVast.mock.calls.map(([url]) => url)).toEqual(["/mid", "/after"]);
  fireEvent.ended(adMedia()); expect(screen.getByTestId("player-end-card")).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Replay" }));
});

it.each(["standard", "Safari"])("exits content picture-in-picture before showing an ad (%s)", async mode => {
  render(<Harness adBreaks={{ before: "/vast" }} />);
  const video = content(), exit = vi.fn().mockResolvedValue(undefined);
  if (mode === "standard") {
    Object.defineProperty(document, "pictureInPictureElement", { configurable: true, value: video });
    Object.defineProperty(document, "exitPictureInPicture", { configurable: true, value: exit });
  } else Object.assign(video, { webkitPresentationMode: "picture-in-picture", webkitSetPresentationMode: exit });
  fireEvent.click(screen.getByRole("button", { name: "Play" })); await deliver();
  if (mode === "standard") expect(exit).toHaveBeenCalledOnce(); else expect(exit).toHaveBeenCalledWith("inline");
  Reflect.deleteProperty(document, "pictureInPictureElement"); Reflect.deleteProperty(document, "exitPictureInPicture");
});
