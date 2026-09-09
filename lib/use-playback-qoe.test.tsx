// @vitest-environment jsdom
//
// THE SOURCE SWITCH (A31). "The client emits playback.start once per session and
// nothing at the source switch, so a viewer who flips to IPFS and watches to the
// end contributes ONE row labelled `api-proxy`; only a later rebuffer, bitrate
// switch or error carries the new source. IPFS delivery is therefore
// near-invisible in QoE for the clean case."
//
// These drive the hook directly rather than through the watch page, because the
// thing under test is exactly one rule — a move between delivery ORIGINS is a
// new start, and a change of anything else is not — and the watch page's own
// gateway probe, overlay and toggle are already covered where they live.
import { act, renderHook } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api";
import type { PlaybackSession, QoEEventInput } from "@/lib/api/types";
import type { EngineId } from "@/lib/player-engine";
import { flushPlaybackEvents, resetPlaybackQoEForTest } from "@/lib/playback-qoe";

import { usePlaybackQoE } from "./use-playback-qoe";

const API_MASTER = "https://vidra.example/api/v1/videos/v1/hls/master.m3u8";
const GATEWAY_MASTER = "https://gateway.example/ipfs/bafkreifakecidforatest/master.m3u8";

const session: PlaybackSession = {
  session_id: "11111111-1111-4111-8111-111111111111",
  video_id: "22222222-2222-4222-8222-222222222222",
  packaging_format: "cmaf",
} as PlaybackSession;

let sent: QoEEventInput[];

/** The one media element the hook observes, with the events it listens for. */
function makeVideo(): HTMLVideoElement {
  const el = document.createElement("video");
  Object.defineProperty(el, "videoHeight", { value: 720, configurable: true });
  return el;
}

function firstFrame(el: HTMLVideoElement) {
  act(() => {
    el.dispatchEvent(new Event("loadeddata"));
  });
}

function startEvents(): QoEEventInput[] {
  return sent.filter((e) => e.type === "playback.start");
}

beforeEach(() => {
  vi.useFakeTimers();
  resetPlaybackQoEForTest();
  sent = [];
  vi.spyOn(api, "postQoEEvents").mockImplementation(async (events: readonly QoEEventInput[]) => {
    sent.push(...events);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("usePlaybackQoE source switch", () => {
  it("emits a second start carrying the gateway URL when the engine moves to IPFS", () => {
    const el = makeVideo();
    const videoRef = createRef<HTMLVideoElement>() as { current: HTMLVideoElement | null };
    videoRef.current = el;

    const { rerender } = renderHook(
      ({ sourceUrl }: { sourceUrl: string }) =>
        usePlaybackQoE({ videoRef, engine: "hls-js", session, sourceUrl }),
      { initialProps: { sourceUrl: API_MASTER } },
    );

    firstFrame(el);
    act(() => {
      flushPlaybackEvents();
    });
    expect(startEvents()).toHaveLength(1);
    expect(startEvents()[0].source_url).toBe(
      "https://vidra.example/api/v1/videos/v1/hls/master.m3u8",
    );

    // The viewer flips to IPFS: the watch page re-points the engine at the
    // gateway master, hls.js is rebuilt, and a first frame arrives from there.
    rerender({ sourceUrl: GATEWAY_MASTER });
    firstFrame(el);
    act(() => {
      flushPlaybackEvents();
    });

    const starts = startEvents();
    expect(starts).toHaveLength(2);
    // The client never names a delivery source; it reports the URL and the
    // server classifies the origin. This one classifies as ipfs-gateway.
    expect(starts[1].source_url).toBe(
      "https://gateway.example/ipfs/bafkreifakecidforatest/master.m3u8",
    );
    expect(starts[1].session_id).toBe(session.session_id);
    expect(starts[1].ttff_ms).toBeGreaterThanOrEqual(0);
  });

  it("emits a start back on the api when the gateway fails and playback falls back", () => {
    const el = makeVideo();
    const videoRef = { current: el as HTMLVideoElement | null };

    const { rerender } = renderHook(
      ({ sourceUrl }: { sourceUrl: string }) =>
        usePlaybackQoE({ videoRef, engine: "hls-js", session, sourceUrl }),
      { initialProps: { sourceUrl: GATEWAY_MASTER } },
    );
    firstFrame(el);
    rerender({ sourceUrl: API_MASTER });
    firstFrame(el);
    act(() => {
      flushPlaybackEvents();
    });

    const starts = startEvents();
    expect(starts).toHaveLength(2);
    expect(starts[0].source_url).toContain("gateway.example");
    // Back on the api: the next event classifies api-proxy.
    expect(starts[1].source_url).toContain("vidra.example");
  });

  it("does not restart for a new URL on the SAME origin", () => {
    const el = makeVideo();
    const videoRef = { current: el as HTMLVideoElement | null };

    const { rerender } = renderHook(
      ({ sourceUrl }: { sourceUrl: string }) =>
        usePlaybackQoE({ videoRef, engine: "hls-js", session, sourceUrl }),
      { initialProps: { sourceUrl: API_MASTER } },
    );
    firstFrame(el);
    // A generation tag is a different URL and the same delivery source. So is a
    // rung change, and so is every segment.
    rerender({ sourceUrl: API_MASTER + "?v=r2" });
    firstFrame(el);
    rerender({ sourceUrl: "https://vidra.example/api/v1/videos/v1/hls/720p/media.m3u8" });
    firstFrame(el);
    act(() => {
      flushPlaybackEvents();
    });

    expect(startEvents()).toHaveLength(1);
  });

  it("does not restart when an engine handover keeps the same source", () => {
    const el = makeVideo();
    const videoRef = { current: el as HTMLVideoElement | null };

    const { rerender } = renderHook(
      ({ engine }: { engine: EngineId }) =>
        usePlaybackQoE({ videoRef, engine, session, sourceUrl: API_MASTER }),
      { initialProps: { engine: "hls-js" as EngineId } },
    );
    firstFrame(el);
    // hls.js declines and native HLS takes the SAME url. TTFF is what the VIEWER
    // waited, not what the winning engine took.
    rerender({ engine: "native-hls" as EngineId });
    firstFrame(el);
    act(() => {
      flushPlaybackEvents();
    });

    expect(startEvents()).toHaveLength(1);
  });

  it("counts the new ladder's opening pick as a pick, not a switch", () => {
    const el = makeVideo();
    const videoRef = { current: el as HTMLVideoElement | null };

    const { result, rerender } = renderHook(
      ({ sourceUrl }: { sourceUrl: string }) =>
        usePlaybackQoE({ videoRef, engine: "hls-js", session, sourceUrl }),
      { initialProps: { sourceUrl: API_MASTER } },
    );
    firstFrame(el);
    act(() => {
      result.current.reportRendition(720);
    });

    rerender({ sourceUrl: GATEWAY_MASTER });
    firstFrame(el);
    // The gateway ladder's first reported rung. It differs from the api
    // ladder's last, and it is still an OPENING PICK — it rides on the new
    // start rather than counting as a mid-stream ABR switch.
    act(() => {
      result.current.reportRendition(480);
    });
    act(() => {
      flushPlaybackEvents();
    });

    expect(sent.filter((e) => e.type === "playback.bitrate_switch")).toHaveLength(0);
    expect(startEvents()).toHaveLength(2);
  });
});
