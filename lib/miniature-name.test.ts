import { describe, expect, it } from "vitest";

import { miniatureDisplayName } from "./miniature-name";

describe("miniatureDisplayName", () => {
  const video = {
    channel_display_name: "Nature Docs",
    channel_handle: "nature",
    author_display_name: "Ada Weaver",
  };

  it("credits the channel by default (flag off)", () => {
    expect(miniatureDisplayName(video, false)).toBe("Nature Docs");
  });

  it("prefers the uploader's display name when the instance flag is on", () => {
    expect(miniatureDisplayName(video, true)).toBe("Ada Weaver");
  });

  it("falls back to the channel while the payload lacks the author field (recorded backend follow-up)", () => {
    expect(
      miniatureDisplayName(
        { channel_display_name: "Nature Docs", channel_handle: "nature" },
        true,
      ),
    ).toBe("Nature Docs");
    expect(
      miniatureDisplayName(
        { channel_display_name: "Nature Docs", channel_handle: "nature", author_display_name: "" },
        true,
      ),
    ).toBe("Nature Docs");
  });

  it("keeps the channel display-name → handle fallback chain", () => {
    expect(
      miniatureDisplayName({ channel_display_name: "", channel_handle: "nature" }, false),
    ).toBe("nature");
    expect(miniatureDisplayName({}, false)).toBe("");
    expect(miniatureDisplayName({}, true)).toBe("");
  });
});
