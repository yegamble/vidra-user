import { describe, expect, it } from "vitest";

import type { Video } from "@/lib/api/types";
import type { InstanceConfigSnapshot } from "@/lib/instance-config.server";
import {
  buildWatchMetadata,
  metaDescription,
  oembedDiscoveryUrl,
  watchThumbnailUrl,
} from "@/lib/watch-metadata";

// apiBaseUrl's test-environment default (lib/config.ts).
const API = "http://localhost:8080";

function video(overrides: Partial<Video> = {}): Video {
  return {
    id: "v1",
    channel_id: "c1",
    title: "Launch Day",
    description: "The first upload.",
    privacy: "public",
    state: "published",
    created_at: "2026-01-01T00:00:00Z",
    has_thumbnail: true,
    ...overrides,
  } as Video;
}

function instance(overrides: object = {}): InstanceConfigSnapshot {
  return {
    name: "Vidra",
    branding: {
      logos: {
        opengraph: { url: "/api/v1/instance/logo/opengraph", is_fallback: false },
      },
    },
    social: { twitter_username: "@vidra" },
    ...overrides,
  } as InstanceConfigSnapshot;
}

describe("watchThumbnailUrl", () => {
  it("builds the API thumbnail URL for a video with a thumbnail", () => {
    expect(watchThumbnailUrl(video())).toBe(`${API}/api/v1/videos/v1/thumbnail`);
  });

  it("URL-encodes the id", () => {
    expect(watchThumbnailUrl(video({ id: "a/b" } as Partial<Video>))).toBe(
      `${API}/api/v1/videos/a%2Fb/thumbnail`,
    );
  });

  it.each([false, undefined])("is null when has_thumbnail is %s", (flag) => {
    expect(watchThumbnailUrl(video({ has_thumbnail: flag } as Partial<Video>))).toBeNull();
  });
});

describe("metaDescription", () => {
  it("keeps a short single line as-is", () => {
    expect(metaDescription("A short description.")).toBe("A short description.");
  });

  it("takes only the first line and trims it", () => {
    expect(metaDescription("  First line  \nSecond line")).toBe("First line");
  });

  it("caps long text with an ellipsis at 200 chars", () => {
    const out = metaDescription("x".repeat(500));
    expect(out.length).toBe(200);
    expect(out.endsWith("…")).toBe(true);
  });

  it("is empty for null/undefined/blank", () => {
    expect(metaDescription(null)).toBe("");
    expect(metaDescription(undefined)).toBe("");
    expect(metaDescription("   ")).toBe("");
  });
});

describe("buildWatchMetadata", () => {
  it("emits nothing for a missing video (layout defaults stand)", () => {
    expect(buildWatchMetadata(null, instance())).toEqual({});
  });

  it("emits nothing for a blank title", () => {
    expect(buildWatchMetadata(video({ title: "  " }), instance())).toEqual({});
  });

  it("prefers the video thumbnail as og:image over the instance opengraph logo", () => {
    const md = buildWatchMetadata(video(), instance());
    expect(md.title).toBe("Launch Day");
    expect(md.description).toBe("The first upload.");
    expect(md.openGraph).toMatchObject({
      title: "Launch Day",
      type: "video.other",
      description: "The first upload.",
      images: [{ url: `${API}/api/v1/videos/v1/thumbnail` }],
    });
    expect(md.twitter).toMatchObject({
      card: "summary_large_image",
      site: "@vidra",
      images: [`${API}/api/v1/videos/v1/thumbnail`],
    });
  });

  it("falls back to the instance opengraph logo when the video has no thumbnail", () => {
    const md = buildWatchMetadata(video({ has_thumbnail: false }), instance());
    expect(md.openGraph).toMatchObject({
      images: [{ url: `${API}/api/v1/instance/logo/opengraph` }],
    });
    expect(md.twitter).toMatchObject({ card: "summary_large_image" });
  });

  it("degrades to an imageless summary card without thumbnail or instance branding", () => {
    const md = buildWatchMetadata(video({ has_thumbnail: false }), null);
    expect(md.openGraph).not.toHaveProperty("images");
    expect(md.twitter).toMatchObject({ card: "summary" });
    expect(md.twitter).not.toHaveProperty("site");
  });

  it("omits description keys for a blank description", () => {
    const md = buildWatchMetadata(video({ description: "" }), instance());
    expect(md).not.toHaveProperty("description");
    expect(md.openGraph).not.toHaveProperty("description");
  });

  it("ignores a fallback instance opengraph slot", () => {
    const md = buildWatchMetadata(
      video({ has_thumbnail: false }),
      instance({
        branding: { logos: { opengraph: { url: "", is_fallback: true } } },
      }),
    );
    expect(md.openGraph).not.toHaveProperty("images");
  });

  it("adds an oembed discovery alternate pointing at the canonical watch URL", () => {
    const md = buildWatchMetadata(video(), instance(), "https://tube.example");
    expect(md.alternates).toEqual({
      // The fixture carries no short_code, so the canonical is the uuid form —
      // the same url the oembed href embeds. The two must never disagree.
      canonical: "/videos/v1",
      types: {
        "application/json+oembed": [
          {
            url: `${API}/services/oembed?url=${encodeURIComponent(
              "https://tube.example/videos/v1",
            )}&format=json`,
            title: "Launch Day",
          },
        ],
      },
    });
  });

  it("omits the oembed alternate when the request origin is unknown", () => {
    // The oembed href must be absolute, so without an origin there is none.
    // The CANONICAL survives: it is relative and resolved against the page's
    // own URL, so it cannot carry a wrong host — which is the one way a
    // canonical does damage.
    for (const md of [buildWatchMetadata(video(), instance()), buildWatchMetadata(video(), instance(), null)]) {
      expect(md.alternates?.types).toBeUndefined();
      expect(md.alternates?.canonical).toBe("/videos/v1");
    }
  });

  it("declares the short code as canonical when the video has one", () => {
    const md = buildWatchMetadata(
      video({ short_code: "abcdefghijk" } as Partial<Video>),
      instance(),
      "https://tube.example",
    );
    expect(md.alternates?.canonical).toBe("/v/abcdefghijk");
    expect(md.openGraph?.url).toBe("/v/abcdefghijk");
  });

  // A start time names a moment in a video, not a different video, so it must
  // never reach the canonical. (The address-bar rewrite keeps it — opposite
  // rule, easy to invert.)
  it("keeps the canonical bare", () => {
    const md = buildWatchMetadata(
      video({ short_code: "abcdefghijk" } as Partial<Video>),
      instance(),
      "https://tube.example",
    );
    expect(md.alternates?.canonical).not.toContain("?");
  });

  it("never advertises oembed for a missing (private/unknown) video", () => {
    expect(buildWatchMetadata(null, instance(), "https://tube.example")).toEqual({});
  });
});

describe("oembedDiscoveryUrl", () => {
  it("encodes the canonical watch URL into the oembed url parameter", () => {
    expect(oembedDiscoveryUrl(video({ id: "a b" } as Partial<Video>), "https://tube.example")).toBe(
      `${API}/services/oembed?url=${encodeURIComponent("https://tube.example/videos/a%20b")}&format=json`,
    );
  });

  it("is null without an origin", () => {
    expect(oembedDiscoveryUrl(video(), null)).toBeNull();
    expect(oembedDiscoveryUrl(video(), undefined)).toBeNull();
  });
});
