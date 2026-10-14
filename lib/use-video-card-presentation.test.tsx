// @vitest-environment jsdom

import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Video } from "@/lib/api";

// The four policy inputs the six video surfaces share. Mocking them keeps this a
// test of the derivation — federation, sensitive treatment, Restricted Mode and
// preview eligibility — rather than of the fetches behind them.
const mocks = vi.hoisted(() => ({
  featureEnabled: true,
  preferenceEnabled: true,
  policy: null as string | null,
  restricted: false,
}));

vi.mock("@/lib/api", () => ({
  isSensitiveVideo: (video: { is_sensitive?: boolean }) => video.is_sensitive === true,
  videoOriginalUrl: (id: string) => `/api/v1/videos/${id}/original`,
  videoThumbnailUrl: (id: string) => `/api/v1/videos/${id}/thumbnail`,
  remoteVideoThumbnailUrl: (id: string) => `/api/v1/remote-videos/${id}/thumbnail`,
}));

vi.mock("@/lib/instance-features", () => ({
  useInstanceFeatures: () => ({ video_card_previews: mocks.featureEnabled }),
}));

vi.mock("@/lib/player-settings", () => ({
  usePlayerSettings: () => ({ video_card_previews_enabled: mocks.preferenceEnabled }),
}));

vi.mock("@/lib/use-sensitive-policy", () => ({
  useSensitiveContentPolicy: () => mocks.policy,
}));

vi.mock("@/lib/device-preferences", () => ({
  useRestrictedMode: () => mocks.restricted,
}));

import { hydrateContentPreferences, resetContentPreferences } from "@/lib/content-preferences";
import {
  useVideoCardPresentation,
  type VideoCardPresentationOptions,
} from "./use-video-card-presentation";

function video(overrides: Partial<Video> = {}): Video {
  return {
    id: "v1",
    remote: false,
    title: "A film",
    description: "",
    privacy: "public",
    state: "published",
    is_sensitive: false,
    sensitive_reason: "",
    created_at: "2026-01-01T00:00:00Z",
    has_thumbnail: true,
    duration_seconds: 90,
    ...overrides,
  } as Video;
}

function presentation(overrides: Partial<Video> = {}, options?: VideoCardPresentationOptions) {
  return renderHook(() => useVideoCardPresentation(video(overrides), options)).result.current;
}

beforeEach(() => {
  mocks.featureEnabled = true;
  mocks.preferenceEnabled = true;
  mocks.policy = null;
  mocks.restricted = false;
});

afterEach(() => {
  cleanup();
  resetContentPreferences();
});

describe("routing and poster by federation", () => {
  it("a local video links to the local watch route and local poster", () => {
    const p = presentation();
    expect(p.isRemote).toBe(false);
    expect(p.watchHref).toBe("/videos/v1");
    expect(p.posterSrc).toBe("/api/v1/videos/v1/thumbnail");
  });

  it("a remote card links to the remote surface and the cached remote poster", () => {
    const p = presentation({ remote: true });
    expect(p.isRemote).toBe(true);
    expect(p.watchHref).toBe("/remote/v1");
    expect(p.posterSrc).toBe("/api/v1/remote-videos/v1/thumbnail");
  });

  it("localWatchQuery tags the LOCAL href only — the remote surface is untouched", () => {
    expect(presentation({}, { localWatchQuery: "?src=related" }).watchHref).toBe(
      "/videos/v1?src=related",
    );
    expect(presentation({ remote: true }, { localWatchQuery: "?src=related" }).watchHref).toBe(
      "/remote/v1",
    );
  });

  it("localOnly treats the payload as local, whatever the remote flag says", () => {
    const p = presentation({ remote: true }, { localOnly: true });
    expect(p.isRemote).toBe(false);
    expect(p.watchHref).toBe("/videos/v1");
    expect(p.posterSrc).toBe("/api/v1/videos/v1/thumbnail");
  });

  it("no thumbnail means no poster", () => {
    expect(presentation({ has_thumbnail: false }).posterSrc).toBeNull();
  });
});

describe("per-flag sensitive-content treatment", () => {
  function withOverrides(policies: Record<string, string>) {
    hydrateContentPreferences({
      sensitive_flag_policies: policies as Record<string, "hide" | "warn" | "blur" | "display">,
      preferred_languages: [],
    });
  }

  it("a flag the viewer blurs blurs the tile even when their base policy displays", () => {
    mocks.policy = "display";
    withOverrides({ violent: "blur" });
    const p = presentation({ is_sensitive: true, sensitive_flags: ["violent"] });
    expect(p.blurSensitive).toBe(true);
    expect(p.markSensitive).toBe(true);
  });

  it("a flag the viewer displays lifts a base blur for that kind only", () => {
    mocks.policy = "blur";
    withOverrides({ sex: "display" });
    expect(presentation({ is_sensitive: true, sensitive_flags: ["sex"] }).blurSensitive).toBe(false);
    expect(presentation({ is_sensitive: true, sensitive_flags: ["violent"] }).blurSensitive).toBe(true);
  });

  it("several flags: the strictest of the viewer's choices wins", () => {
    mocks.policy = "display";
    withOverrides({ violent: "warn", sex: "blur" });
    // warn is stricter than blur in the resolved order, so the tile is badged
    // (warn) rather than blurred, and the watch page would gate it.
    const p = presentation({ is_sensitive: true, sensitive_flags: ["violent", "sex"] });
    expect(p.blurSensitive).toBe(false);
    expect(p.markSensitive).toBe(true);
    withOverrides({ violent: "display", sex: "blur" });
    expect(presentation({ is_sensitive: true, sensitive_flags: ["violent", "sex"] }).blurSensitive).toBe(true);
  });

  it("an unflagged sensitive video ignores the per-flag overrides", () => {
    mocks.policy = "warn";
    withOverrides({ violent: "blur" });
    const p = presentation({ is_sensitive: true, sensitive_flags: [] });
    expect(p.blurSensitive).toBe(false);
    expect(p.markSensitive).toBe(true);
  });
});

describe("sensitive-content treatment", () => {
  it("a non-sensitive video is never blurred or badged, whatever the policy", () => {
    mocks.policy = "blur";
    const p = presentation({ is_sensitive: false });
    expect(p.sensitive).toBe(false);
    expect(p.blurSensitive).toBe(false);
    expect(p.markSensitive).toBe(false);
  });

  it("blur blurs AND badges", () => {
    mocks.policy = "blur";
    const p = presentation({ is_sensitive: true });
    expect(p.blurSensitive).toBe(true);
    expect(p.markSensitive).toBe(true);
  });

  it("warn badges without blurring", () => {
    mocks.policy = "warn";
    const p = presentation({ is_sensitive: true });
    expect(p.blurSensitive).toBe(false);
    expect(p.markSensitive).toBe(true);
  });

  it("display, and an unresolved policy, apply no treatment", () => {
    mocks.policy = "display";
    expect(presentation({ is_sensitive: true }).markSensitive).toBe(false);
    mocks.policy = null;
    expect(presentation({ is_sensitive: true }).markSensitive).toBe(false);
  });
});

describe("Restricted Mode", () => {
  it("hides a sensitive video", () => {
    mocks.restricted = true;
    expect(presentation({ is_sensitive: true }).restrictedHidden).toBe(true);
  });

  it("leaves a non-sensitive video alone", () => {
    mocks.restricted = true;
    expect(presentation({ is_sensitive: false }).restrictedHidden).toBe(false);
  });

  it("does nothing while off", () => {
    expect(presentation({ is_sensitive: true }).restrictedHidden).toBe(false);
  });
});

describe("hover-preview eligibility", () => {
  it("an eligible local video carries the original media source", () => {
    const p = presentation();
    expect(p.previewEligible).toBe(true);
    expect(p.previewSrc).toBe("/api/v1/videos/v1/original");
  });

  it("the instance feature switch and the viewer preference each veto it", () => {
    mocks.featureEnabled = false;
    expect(presentation().previewEligible).toBe(false);
    mocks.featureEnabled = true;
    mocks.preferenceEnabled = false;
    expect(presentation().previewEligible).toBe(false);
  });

  it("remote cards never preview — a federated stream needs the hls.js pipeline", () => {
    const p = presentation({ remote: true });
    expect(p.previewEligible).toBe(false);
    expect(p.previewSrc).toBeNull();
  });

  it("private, password and internal media never preview — a card holds no credential", () => {
    expect(presentation({ privacy: "private" }).previewEligible).toBe(false);
    expect(presentation({ privacy: "password" }).previewEligible).toBe(false);
    // Internal (members-only) cards reach signed-in feeds, but the bytes still
    // need the viewer's credential.
    expect(presentation({ privacy: "internal" }).previewEligible).toBe(false);
    expect(presentation({ privacy: "unlisted" }).previewEligible).toBe(true);
  });

  it("only published videos preview", () => {
    expect(presentation({ state: "transcoding" }).previewEligible).toBe(false);
  });

  it("a blurred video never previews — the preview would defeat the blur", () => {
    mocks.policy = "blur";
    expect(presentation({ is_sensitive: true }).previewEligible).toBe(false);
  });
});

describe("duration", () => {
  it("reports whole seconds", () => {
    expect(presentation({ duration_seconds: 125 }).duration).toBe(125);
  });

  it("drops a sub-second clip rather than badging it 0:00", () => {
    expect(presentation({ duration_seconds: 0 }).duration).toBeNull();
  });

  it("drops an unprobed duration", () => {
    expect(presentation({ duration_seconds: null }).duration).toBeNull();
    expect(presentation({ duration_seconds: undefined }).duration).toBeNull();
  });
});
