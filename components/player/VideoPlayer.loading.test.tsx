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
  const view = render(<Harness startAt={startAt} />), video = view.container.querySelector("video")!;
  const state = { readyState: 0, paused: true, seeking: false };
  for (const key of ["readyState", "paused", "seeking"] as const) Object.defineProperty(video, key, { get: () => state[key] });
  vi.spyOn(video, "play").mockImplementation(() => {
    state.paused = false; fireEvent.play(video);
    return new Promise(() => {});
  });
  const event = (name: string, next = {}) => { Object.assign(state, next); fireEvent(video, new Event(name)); };
  return { ...view, video, event };
}
const loading = () => screen.queryByRole("status", { name: "Loading video" });
beforeEach(() => { mock.failed = false; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
function expectLoading(expected: boolean) {
  expect(loading() !== null).toBe(expected);
  if (expected) expect(screen.queryByTestId("playback-feedback")).toBeNull();
}
it.each([true, false])("tracks first play, resume, stalls and saved-position seeks (paused seek=%s)", (paused) => {
  vi.useFakeTimers();
  const { event, video } = setup(75);
  const step = (name: string, state: object, loading: boolean) => { event(name, state); expectLoading(loading); };
  expectLoading(true);
  fireEvent.click(screen.getByRole("button", { name: "Play" })); expectLoading(true);
  step("loadeddata", { readyState: 2 }, true);
  act(() => vi.advanceTimersByTime(2100));
  step("canplay", { readyState: 3 }, false);
  step("playing", { readyState: 4 }, false);
  expect(screen.queryByTestId("playback-feedback")).toBeNull(); // expired feedback stays expired
  step("waiting", { readyState: 2 }, true);
  step("pause", { paused: true }, false);
  fireEvent.click(screen.getByRole("button", { name: "Play" })); expectLoading(true);
  step("playing", { readyState: 4 }, false);
  step("pause", { paused: true }, false);
  fireEvent.click(screen.getByRole("button", { name: "Play" })); expectLoading(false); // warm resume
  video.currentTime = 75;
  step("seeking", { paused, seeking: true, readyState: 1 }, true);
  step("seeked", { seeking: false }, true); // completion alone is not readiness
  step("canplay", { readyState: 3 }, false);
  step("seeking", { seeking: true, readyState: 4 }, false); // buffered seek
  step("seeked", { seeking: false }, false);
});
it("clears loading on cancellation, end, errors and source replacement", () => {
  const { event, rerender } = setup();
  for (const [name, state] of [["pause", { paused: true }], ["loadeddata", { readyState: 2 }], ["ended", {}], ["error", {}]] as const) {
    event("loadstart", { readyState: 0 }); expectLoading(true);
    event(name, state); expectLoading(false);
  }
  event("loadstart"); mock.failed = true; rerender(<Harness />);
  expectLoading(false); expect(screen.getByRole("alert")).toBeTruthy();
});
it("loads the time selected by a pointer click on the timeline", () => {
  const { video, event } = setup(); Object.defineProperty(video, "duration", { value: 120 });
  event("loadedmetadata"); event("playing", { readyState: 4, paused: false });
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
  event("seeking", { seeking: true, readyState: 1 }); expectLoading(true);
  event("seeked", { seeking: false, readyState: 3 }); expectLoading(false);
});
it("clears a rejected play attempt even when the browser emits no pause", async () => {
  const { video, event } = setup();
  vi.mocked(video.play).mockImplementation(() => {
    event("play", { paused: true });
    return Promise.reject(new DOMException("Gesture required", "NotAllowedError"));
  });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Play" })));
  expectLoading(false); expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
});
