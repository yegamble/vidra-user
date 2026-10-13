// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ChannelFeedLink, podcastFeedUrl } from "./ChannelFeedLink";

afterEach(cleanup);

describe("ChannelFeedLink", () => {
  it("links to the channel's podcast feed with the handle escaped", () => {
    render(<ChannelFeedLink handle="a b" name="Ada" />);
    const a = screen.getByRole("link", { name: "Podcast feed for Ada" });
    expect(a.getAttribute("href")).toBe(podcastFeedUrl("a b"));
    expect(podcastFeedUrl("a b")).toMatch(/\/feeds\/podcast\/videos\.xml\?channel=a%20b$/);
  });
});
