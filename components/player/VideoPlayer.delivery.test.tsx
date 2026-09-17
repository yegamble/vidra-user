// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { Video } from "@/lib/api";
import type { HlsPlayback, PlaybackDelivery } from "@/lib/use-playback-engine";
import { resetPlayerSettings } from "@/lib/player-settings";
import { VideoPlayer } from "./VideoPlayer";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {} }) }));
vi.mock("@/lib/instance-defaults", async (original) => ({ ...await original<typeof import("@/lib/instance-defaults")>(), primeInstanceDefaults() {} }));
const mock = vi.hoisted(() => ({ playback: null as unknown as HlsPlayback, hook: vi.fn() }));
vi.mock("@/lib/use-playback-engine", () => ({ useHlsPlayback: (...args: unknown[]) => { mock.hook(...args); return mock.playback; } }));
const video = { id: "one", title: "Clip", privacy: "public", state: "published" } as Video;
const report = vi.fn();
function Harness() {
  const ref = useRef<HTMLVideoElement | null>(null);
  return <VideoPlayer video={video} videoRef={ref} startAt={null} onDeliveryChange={report} />;
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); report.mockClear(); mock.hook.mockClear(); resetPlayerSettings(); });

it("reports actual fallback source and makes native IPFS anonymous before assigning its src", async () => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  const writes: string[] = [];
  const original = HTMLVideoElement.prototype.setAttribute;
  vi.spyOn(HTMLVideoElement.prototype, "setAttribute").mockImplementation(function (this: HTMLVideoElement, name, value) {
    writes.push(name.toLowerCase()); original.call(this, name, value);
  });
  const delivery: PlaybackDelivery = { source: "ipfs", available: true, select() {} };
  mock.playback = { mode: "native-hls", src: "https://gateway.test/ipfs/cid/hashed.m3u8", sourceUrl: "https://gateway.test/ipfs/cid/hashed.m3u8",
    delivery, failed: false, levels: [], currentQuality: "auto", activeHeight: null,
    audioTracks: [], currentAudioTrack: "", setAudioTrack() {}, setQuality() {}, retry() {}, pending: false, dashUrl: null };
  const { container, rerender } = render(<Harness />);
  await waitFor(() => expect(report).toHaveBeenLastCalledWith(delivery));
  expect(mock.hook.mock.lastCall?.[5]).toBe(true);
  expect(writes.indexOf("crossorigin")).toBeGreaterThanOrEqual(0);
  expect(writes.indexOf("crossorigin")).toBeLessThan(writes.indexOf("src"));
  expect(container.querySelector("video")!.crossOrigin).toBe("anonymous");
  mock.playback = { ...mock.playback, src: "/private-original", delivery: { ...delivery, source: "original" } };
  rerender(<Harness />);
  expect(report).toHaveBeenLastCalledWith(mock.playback.delivery);
  expect(container.querySelector("video")!.hasAttribute("crossorigin")).toBe(false);
});
