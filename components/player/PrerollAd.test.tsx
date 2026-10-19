// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { VastDocument } from "@/lib/vast";
import { trackVast } from "@/lib/vast-client";
import { PrerollAd } from "./PrerollAd";
vi.mock("@/lib/vast-client", () => ({ trackVast: vi.fn() }));
const ad: VastDocument = { mediaUrl: "https://ads.test/clip.mp4", duration: 40, skipAfter: 5, clickThrough: "https://advertiser.test/", impressions: ["impression"], errors: ["error"], clickTracking: ["click"], tracking: Object.fromEntries(["start", "firstQuartile", "midpoint", "thirdQuartile", "complete", "skip"].map(event => [event, [event]])) };
function setup(override = {}) {
  const onDone = vi.fn();
  const onStart = vi.fn();
  const view = render(<PrerollAd ad={{ ...ad, ...override }} onDone={onDone} onStart={onStart} />);
  const video = view.container.querySelector("video")!;
  const time = (seconds: number) => { video.currentTime = seconds; fireEvent.timeUpdate(video); };
  return { ...view, video, time, onDone, onStart };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); vi.useRealTimers(); });
it("uses a separate inline ad video and focuses its first control", () => {
  const { video } = setup();
  expect(video.autoplay).toBe(true); expect(video.playsInline).toBe(true);
  expect(video.controls).toBe(false); expect(video.getAttribute("crossorigin")).toBe("anonymous");
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Play advertisement" }));
});
it("tracks real playing and quartiles once, and completes only on ended", () => {
  const { video, time, onDone, onStart } = setup();
  expect(trackVast).not.toHaveBeenCalled();
  fireEvent.playing(video); fireEvent.playing(video);
  expect(onStart).toHaveBeenCalledOnce();
  for (const seconds of [10, 20, 30, 40, 20, 40]) time(seconds);
  expect(vi.mocked(trackVast).mock.calls.map(([urls]) => urls[0])).toEqual(["impression", "start", "firstQuartile", "midpoint", "thirdQuartile"]);
  expect(onDone).not.toHaveBeenCalled();
  fireEvent.ended(video); fireEvent.ended(video);
  expect(onDone).toHaveBeenCalledOnce(); expect(trackVast).toHaveBeenCalledWith(["complete"]);
});
it("inherits content volume and embed mute without affecting the content element", () => {
  const { container } = render(<PrerollAd ad={ad} onDone={vi.fn()} initialVolume={0.25} initialMuted />);
  const video = container.querySelector("video")!;
  expect(video.volume).toBe(0.25); expect(video.muted).toBe(true);
  fireEvent.volumeChange(video);
  fireEvent.click(screen.getByRole("button", { name: "Unmute advertisement" }));
  expect(video.muted).toBe(false);
  fireEvent.playing(video); fireEvent.click(screen.getByRole("button", { name: "Pause advertisement" }));
  expect(video.pause).toHaveBeenCalledOnce();
});
it("offers Skip only after the declared offset and never records complete for it", () => {
  const { time, onDone } = setup(); time(4);
  expect(screen.queryByRole("button", { name: "Skip ad" })).toBeNull();
  expect(screen.getByText("Skip in 1s")).toBeTruthy(); time(5);
  fireEvent.click(screen.getByRole("button", { name: "Skip ad" }));
  expect(onDone).toHaveBeenCalledOnce(); expect(trackVast).toHaveBeenCalledWith(["skip"]);
  expect(trackVast).not.toHaveBeenCalledWith(["complete"]);
});
it("keeps an unskippable ad unskippable and tracks only explicit advertiser clicks", () => {
  const { time } = setup({ skipAfter: null }); time(40);
  expect(screen.queryByRole("button", { name: "Skip ad" })).toBeNull();
  const link = screen.getByRole("link", { name: "Visit advertiser" });
  expect(link.getAttribute("target")).toBe("_blank"); expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  expect(trackVast).not.toHaveBeenCalledWith(["click"]); fireEvent.click(link);
  expect(trackVast).toHaveBeenCalledWith(["click"]);
});
it("leaves a Play control after autoplay refusal without retrying muted or timing out", async () => {
  vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new DOMException("User gesture required", "NotAllowedError"));
  const { video, onDone } = setup(); await act(async () => { await Promise.resolve(); });
  expect(screen.getByRole("button", { name: "Play advertisement" })).toBeTruthy();
  fireEvent.loadStart(video);
  act(() => vi.advanceTimersByTime(12001)); expect(onDone).not.toHaveBeenCalled();
  expect(video.muted).toBe(false); expect(video.play).toHaveBeenCalledOnce();
});
it.each(["error", "initial loading", "waiting"])("fails open once on %s without recording completion", kind => {
  const { video, onDone } = setup();
  if (kind === "error") fireEvent.error(video);
  else { if (kind === "waiting") { fireEvent.playing(video); fireEvent.waiting(video); } act(() => vi.advanceTimersByTime(12000)); }
  fireEvent.error(video);
  expect(onDone).toHaveBeenCalledOnce(); expect(trackVast).toHaveBeenCalledWith(["error"], kind === "error" ? 405 : 402);
  expect(trackVast).not.toHaveBeenCalledWith(["complete"]);
});
it("clears waiting deadlines on playing and explicit pause", () => {
  const { video, onDone } = setup(); fireEvent.playing(video);
  fireEvent.waiting(video); fireEvent.pause(video); act(() => vi.advanceTimersByTime(12000));
  fireEvent.waiting(video); fireEvent.playing(video); act(() => vi.advanceTimersByTime(12000));
  expect(onDone).not.toHaveBeenCalled();
});
it("does not finish or track a stale play rejection after unmount", async () => {
  let reject!: (error: Error) => void;
  vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  const { unmount, onDone } = setup(); unmount();
  await act(async () => { reject(new Error("late failure")); await Promise.resolve(); });
  expect(onDone).not.toHaveBeenCalled(); expect(trackVast).not.toHaveBeenCalled();
});
