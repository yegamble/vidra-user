import { describe, expect, it } from "vitest";

import { parseEmbedParams } from "./embed-params";

describe("parseEmbedParams", () => {
  it("defaults match PeerTube", () => {
    expect(parseEmbedParams("")).toEqual({
      startAt: null, stopAt: null, autoplay: false, muted: false, loop: false,
      title: true, controls: true, warningTitle: true, peertubeLink: true, api: false, scope: "peertube",
    });
  });
  it("reads toggles as 1/true only", () => {
    const p = parseEmbedParams("?autoplay=1&muted=true&loop=yes&api=1&title=0&controls=false&warningTitle=0&peertubeLink=0");
    expect(p).toMatchObject({
      autoplay: true, muted: true, loop: false, api: true,
      title: false, controls: false, warningTitle: false, peertubeLink: false,
    });
  });
  it("start is an alias of t; t wins; PeerTube time formats", () => {
    expect(parseEmbedParams("?start=1m30s").startAt).toBe(90);
    expect(parseEmbedParams("?t=5&start=90").startAt).toBe(5);
    expect(parseEmbedParams("?stop=2m").stopAt).toBe(120);
  });
  it("ignores invalid values", () => {
    const p = parseEmbedParams("?start=abc&stop=-3&t=&scope=a b%3Cx");
    expect(p.startAt).toBeNull();
    expect(p.stopAt).toBeNull();
    expect(p.scope).toBe("peertube");
  });
  it("drops a stop that is not after start", () => {
    expect(parseEmbedParams("?start=60&stop=30").stopAt).toBeNull();
  });
  it("accepts a safe custom scope", () => {
    expect(parseEmbedParams("?scope=my-player_1").scope).toBe("my-player_1");
  });
});
