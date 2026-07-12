import { describe, expect, it } from "vitest";

import {
  feedDefaultsForLanding,
  resolveFeedScope,
  resolveFeedSort,
  resolveLandingPage,
  shouldRenderHomepageDocument,
} from "./feed-defaults";

describe("resolveFeedSort", () => {
  it("lets a valid explicit URL sort win over any fallback", () => {
    expect(resolveFeedSort("popular", "recent")).toBe("popular");
    expect(resolveFeedSort("trending", "recent")).toBe("trending");
    expect(resolveFeedSort("recent", "popular")).toBe("recent");
  });

  it("falls back to the caller's default for absent/unknown values", () => {
    expect(resolveFeedSort(undefined, "popular")).toBe("popular");
    expect(resolveFeedSort("bogus", "trending")).toBe("trending");
  });

  it("defaults to recent with no instance signal (pre-W5 behavior)", () => {
    expect(resolveFeedSort(undefined)).toBe("recent");
    expect(resolveFeedSort("nope")).toBe("recent");
  });
});

describe("resolveFeedScope", () => {
  it("lets a valid explicit URL scope win over any fallback", () => {
    expect(resolveFeedScope("local", "all")).toBe("local");
    expect(resolveFeedScope("all", "local")).toBe("all");
  });

  it("falls back to the caller's default, then local", () => {
    expect(resolveFeedScope(undefined, "all")).toBe("all");
    expect(resolveFeedScope("bogus", "all")).toBe("all");
    expect(resolveFeedScope(undefined)).toBe("local");
  });
});

describe("resolveLandingPage", () => {
  it("passes every known landing option through", () => {
    expect(resolveLandingPage({ landing_page: "home-recent" })).toBe("home-recent");
    expect(resolveLandingPage({ landing_page: "trending" })).toBe("trending");
    expect(resolveLandingPage({ landing_page: "local" })).toBe("local");
    expect(resolveLandingPage({ landing_page: "home" })).toBe("home");
  });

  it("normalizes absent/unknown values to home-recent (today's behavior)", () => {
    expect(resolveLandingPage(undefined)).toBe("home-recent");
    expect(resolveLandingPage(null)).toBe("home-recent");
    expect(resolveLandingPage({})).toBe("home-recent");
    expect(
      resolveLandingPage({ landing_page: "weird" as unknown as "home-recent" }),
    ).toBe("home-recent");
  });
});

describe("feedDefaultsForLanding", () => {
  const defaults = { feed_sort: "popular", feed_scope: "all" } as const;

  it("home-recent applies the instance browse defaults directly", () => {
    expect(feedDefaultsForLanding("home-recent", defaults)).toEqual({
      sort: "popular",
      scope: "all",
    });
  });

  it("trending renders the trending surface with the instance scope", () => {
    expect(feedDefaultsForLanding("trending", defaults)).toEqual({
      sort: "trending",
      scope: "all",
    });
  });

  it("local pins the scope to this instance, keeping the sort default", () => {
    expect(feedDefaultsForLanding("local", defaults)).toEqual({
      sort: "popular",
      scope: "local",
    });
  });

  it("home falls back to home-recent until the W6 homepage document ships", () => {
    expect(feedDefaultsForLanding("home", defaults)).toEqual({
      sort: "popular",
      scope: "all",
    });
  });

  it("without an instance snapshot every branch reduces to the shipped recent/local pair", () => {
    expect(feedDefaultsForLanding("home-recent", undefined)).toEqual({
      sort: "recent",
      scope: "local",
    });
    expect(feedDefaultsForLanding("trending", null)).toEqual({
      sort: "trending",
      scope: "local",
    });
    expect(feedDefaultsForLanding("local", undefined)).toEqual({
      sort: "recent",
      scope: "local",
    });
  });

  it("ignores malformed instance values (old/odd backend)", () => {
    const bad = {
      feed_sort: "newest" as unknown as "recent",
      feed_scope: "everything" as unknown as "local",
    };
    expect(feedDefaultsForLanding("home-recent", bad)).toEqual({
      sort: "recent",
      scope: "local",
    });
  });
});

// The 'home' landing branch (config-parity W6): when a bare "/" shows the
// admin-authored homepage document instead of the feed.
describe("shouldRenderHomepageDocument", () => {
  const bare = {};

  it("renders the document for a bare '/' when landing=home and it is enabled", () => {
    expect(shouldRenderHomepageDocument("home", { enabled: true, hash: "h" }, bare)).toBe(true);
  });

  it("falls back to the feed when the document is empty/disabled or absent", () => {
    expect(shouldRenderHomepageDocument("home", { enabled: false, hash: "" }, bare)).toBe(false);
    expect(shouldRenderHomepageDocument("home", {}, bare)).toBe(false);
    expect(shouldRenderHomepageDocument("home", undefined, bare)).toBe(false);
    expect(shouldRenderHomepageDocument("home", null, bare)).toBe(false);
  });

  it("never renders for any other landing choice, even with a document", () => {
    expect(shouldRenderHomepageDocument("home-recent", { enabled: true }, bare)).toBe(false);
    expect(shouldRenderHomepageDocument("trending", { enabled: true }, bare)).toBe(false);
    expect(shouldRenderHomepageDocument("local", { enabled: true }, bare)).toBe(false);
  });

  it("an explicit feed param wins — the feed stays shareable/reachable", () => {
    const homepage = { enabled: true };
    expect(shouldRenderHomepageDocument("home", homepage, { sort: "recent" })).toBe(false);
    expect(shouldRenderHomepageDocument("home", homepage, { scope: "all" })).toBe(false);
    expect(shouldRenderHomepageDocument("home", homepage, { tag: "music" })).toBe(false);
    expect(shouldRenderHomepageDocument("home", homepage, { category: "7" })).toBe(false);
    expect(shouldRenderHomepageDocument("home", homepage, { language: "en" })).toBe(false);
  });
});
