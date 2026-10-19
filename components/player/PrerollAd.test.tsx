// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { I18nProvider } from "@/components/I18nProvider";
import { watch as french } from "@/lib/i18n/fr/watch";
import type { VastDocument } from "@/lib/vast";
import { trackVast } from "@/lib/vast-client";
import { PrerollAd } from "./PrerollAd";
vi.mock("@/lib/vast-client", () => ({ trackVast: vi.fn() }));
const ad: VastDocument = { mediaUrl: "https://ads.test/clip.mp4", duration: 40, skipAfter: 5, clickThrough: "https://advertiser.test/", impressions: ["impression"], errors: ["error"], clickTracking: ["click"], tracking: Object.fromEntries(["start", "firstQuartile", "midpoint", "thirdQuartile", "complete", "skip"].map(event => [event, [event]])) };
function setup(override = {}, props: Partial<ComponentProps<typeof PrerollAd>> = {}) {
  const onDone = vi.fn();
  const onStart = vi.fn();
  const view = render(<PrerollAd ad={{ ...ad, ...override }} onDone={onDone} onStart={onStart} {...props} />);
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
  expect(screen.getByText("Skip in 1…")).toBeTruthy(); time(5);
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
  const { video, onDone } = setup({}, { showControls: false }); await act(async () => { await Promise.resolve(); });
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
it.each([[0, 5, null], [8, 5, 8], [3, 5, 5], [4, null, 4]] as const)("applies admin skip %s over creative offset %s", (configured, creative, threshold) => {
  const { time } = setup({ skipAfter: creative }, { skipAfterSeconds: configured });
  time(threshold === null ? 40 : threshold - 0.1);
  expect(screen.queryByRole("button", { name: "Skip ad" })).toBeNull();
  if (threshold !== null) { time(threshold); expect(screen.getByRole("button", { name: "Skip ad" })).toBeTruthy(); }
  else expect(screen.queryByText(/Skip in/)).toBeNull();
});
it("renders custom labels as plain text and replaces every seconds placeholder", () => {
  const { time } = setup({}, { skipAfterSeconds: 8, skipCountdown: "Wait {seconds}/{seconds} <b>now</b>", skipLabel: "", remainingMessage: "Ends in {seconds}/{seconds}" });
  time(1.1);
  expect(screen.getByText("Wait 7/7 <b>now</b>")).toBeTruthy();
  expect(screen.getByText("Ends in 39/39")).toBeTruthy();
  time(8); expect(screen.getByRole("button", { name: "Skip ad" })).toBeTruthy();
});
it("hides an explicitly empty remaining message and falls back from empty countdown", () => {
  setup({}, { remainingMessage: "", skipCountdown: "" });
  expect(screen.queryByText(/This ad will end/)).toBeNull();
  expect(screen.getByText("Skip in 5…")).toBeTruthy();
});
it("replaces every seconds placeholder in the custom skip label", () => {
  const { time } = setup({}, { skipLabel: "Continue {seconds}/{seconds}" }); time(5);
  expect(screen.getByRole("button", { name: "Continue 0/0" })).toBeTruthy();
});
it("keeps video tap and focused keyboard transport available with hidden controls", () => {
  const { video } = setup({}, { showControls: false });
  fireEvent.playing(video);
  const region = screen.getByRole("region", { name: "Advertisement" });
  expect(region.tabIndex).toBe(0); expect(document.activeElement).toBe(region);
  expect(screen.queryByRole("button", { name: /Pause|Mute advertisement/ })).toBeNull();
  fireEvent.click(video); expect(video.pause).toHaveBeenCalledOnce(); fireEvent.pause(video);
  expect(screen.getByRole("button", { name: "Play advertisement" })).toBeTruthy();
  fireEvent.keyDown(region, { key: "k" }); expect(video.play).toHaveBeenCalledTimes(2);
  fireEvent.playing(video); fireEvent.keyDown(region, { key: " " }); expect(video.pause).toHaveBeenCalledTimes(2);
});
it("translates the backend's default English templates", () => {
  render(<I18nProvider locale="fr" messages={french}><PrerollAd ad={ad} onDone={vi.fn()} skipCountdown="Skip in {seconds}…" remainingMessage="This ad will end in {seconds}" /></I18nProvider>);
  expect(screen.getByText("Passer dans 5 s…")).toBeTruthy();
  expect(screen.getByText("Cette publicité se termine dans 40 s")).toBeTruthy();
});
