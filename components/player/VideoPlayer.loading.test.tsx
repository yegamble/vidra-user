// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Video } from "@/lib/api";
import type { HlsPlayback } from "@/lib/use-playback-engine";
import { VideoPlayer } from "./VideoPlayer";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {} }) }));
vi.mock("@/lib/instance-defaults", async (original) => ({ ...await original<typeof import("@/lib/instance-defaults")>(), primeInstanceDefaults() {} }));
const mock = vi.hoisted(() => ({ failed: false }));
vi.mock("@/lib/use-playback-engine", () => ({ useHlsPlayback: () => ({
  mode: "original", src: "/original", failed: mock.failed, levels: [], currentQuality: "auto",
  activeHeight: null, audioTracks: [], currentAudioTrack: "", setAudioTrack() {},
  setQuality() {}, retry() {}, pending: false, dashUrl: null,
} as unknown as HlsPlayback) }));
const clip = { id: "one", title: "Clip", privacy: "public", state: "published" } as Video;
function Harness({ startAt = null }: { startAt?: number | null }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  return <VideoPlayer video={clip} videoRef={ref} startAt={startAt} />;
}
function setup(startAt?: number) {
  const view = render(<Harness startAt={startAt} />);
  const video = view.container.querySelector("video")!;
  const state = { readyState: 0, paused: true, seeking: false };
  for (const key of ["readyState", "paused", "seeking"] as const) {
    Object.defineProperty(video, key, { get: () => state[key] });
  }
  vi.spyOn(video, "play").mockImplementation(() => {
    state.paused = false;
    fireEvent.play(video);
    return new Promise(() => {});
  });
  const event = (name: string, next = {}) => { Object.assign(state, next); fireEvent(video, new Event(name)); };
  return { ...view, video, event };
}
const loading = () => screen.queryByRole("status", { name: "Loading video" });
beforeEach(() => { mock.failed = false; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

it("replaces first-play feedback with loading until playback can start", () => {
  const { event } = setup();
  expect(loading()).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Play" }));
  expect(loading()).not.toBeNull();
  expect(screen.queryByTestId("playback-feedback")).toBeNull();
  event("loadeddata", { readyState: 2 }); // a frame is not yet playable forward
  expect(loading()).not.toBeNull();
  event("canplay", { readyState: 3 });
  expect(loading()).toBeNull();
  event("playing", { readyState: 4 });
  expect(loading()).toBeNull();
});

it("shows loading again when resuming a paused video needs more data", () => {
  const { event } = setup();
  event("canplay", { readyState: 4 });
  fireEvent.click(screen.getByRole("button", { name: "Play" }));
  expect(loading()).toBeNull(); // warm play incurs no artificial loading delay
  event("pause", { paused: true });
  expect(loading()).toBeNull();
  event("progress", { readyState: 2 });
  fireEvent.click(screen.getByRole("button", { name: "Play" }));
  expect(loading()).not.toBeNull();
  event("playing", { readyState: 4 });
  expect(loading()).toBeNull();
});

it.each([true, false])("tracks an unbuffered seek, including saved-position resume (paused=%s)", (paused) => {
  const { event, video } = setup(75);
  event("canplay", { readyState: 4, paused });
  video.currentTime = 75;
  event("seeking", { seeking: true, readyState: 1 });
  expect(loading()).not.toBeNull();
  expect(screen.queryByTestId("playback-feedback")).toBeNull();
  event("seeked", { seeking: false, readyState: 1 });
  expect(loading()).not.toBeNull(); // seek completion alone does not mean data arrived
  event("canplay", { readyState: 3 });
  expect(loading()).toBeNull();
  event("seeking", { seeking: true, readyState: 4 });
  expect(loading()).toBeNull(); // buffered seeks stay immediate
  event("seeked", { seeking: false });
  expect(loading()).toBeNull();
});

it("covers mid-play stalls and clears on cancellation, end, error and source replacement", () => {
  const { event, rerender } = setup();
  event("playing", { paused: false, readyState: 4 });
  event("waiting", { readyState: 2 });
  expect(loading()).not.toBeNull();
  event("pause", { paused: true });
  expect(loading()).toBeNull();
  event("loadstart", { readyState: 0 });
  expect(loading()).not.toBeNull();
  event("loadeddata", { readyState: 2 });
  expect(loading()).toBeNull(); // a paused preview needs only the current frame
  event("waiting", { paused: false });
  event("ended");
  expect(loading()).toBeNull();
  event("loadstart");
  event("error");
  expect(loading()).toBeNull();
  event("loadstart");
  mock.failed = true;
  rerender(<Harness />);
  expect(loading()).toBeNull();
  expect(screen.getByRole("alert")).toBeTruthy();
});

it("does not replay an expired play glyph after a long load", () => {
  vi.useFakeTimers();
  const { event } = setup();
  fireEvent.click(screen.getByRole("button", { name: "Play" }));
  act(() => vi.advanceTimersByTime(2100));
  event("playing", { readyState: 4 });
  expect(loading()).toBeNull();
  expect(screen.queryByTestId("playback-feedback")).toBeNull();
});

it("loads the time selected by a pointer click on the timeline", () => {
  const { video, event } = setup();
  Object.defineProperty(video, "duration", { value: 120 });
  event("loadedmetadata");
  event("playing", { readyState: 4, paused: false });
  const slider = screen.getByRole("slider", { name: "Seek" });
  Object.assign(slider, {
    getBoundingClientRect: () => ({ left: 0, width: 200 }),
    setPointerCapture: vi.fn(), releasePointerCapture: vi.fn(),
  });
  for (const type of ["pointerdown", "pointerup"]) {
    const pointer = new Event(type, { bubbles: true });
    Object.assign(pointer, { button: 0, pointerId: 1, pointerType: "mouse", clientX: 150 });
    fireEvent(slider, pointer);
  }
  expect(video.currentTime).toBe(90);
  event("seeking", { seeking: true, readyState: 1 });
  expect(loading()).not.toBeNull();
  event("seeked", { seeking: false, readyState: 3 });
  expect(loading()).toBeNull();
});

it("clears a rejected play attempt even when the browser emits no pause", async () => {
  const { video, event } = setup();
  vi.mocked(video.play).mockImplementation(() => {
    event("play", { paused: true });
    return Promise.reject(new DOMException("Gesture required", "NotAllowedError"));
  });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Play" })));
  expect(loading()).toBeNull();
  expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
});
