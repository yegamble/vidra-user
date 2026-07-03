import { describe, expect, it } from "vitest";

import { parseRemoteFollowTarget } from "./remote-follow";

describe("parseRemoteFollowTarget", () => {
  it("maps name@domain input to a handle target", () => {
    expect(parseRemoteFollowTarget("films@videos.example")).toEqual({
      handle: "films@videos.example",
    });
  });

  it("tolerates a leading @ and surrounding whitespace", () => {
    expect(parseRemoteFollowTarget("  @films@videos.example ")).toEqual({
      handle: "films@videos.example",
    });
  });

  it("accepts a host:port domain (dev instances)", () => {
    expect(parseRemoteFollowTarget("films@remote:8081")).toEqual({
      handle: "films@remote:8081",
    });
  });

  it("maps an http(s) URL to an actor_url target", () => {
    expect(parseRemoteFollowTarget("https://videos.example/video-channels/films")).toEqual({
      actor_url: "https://videos.example/video-channels/films",
    });
    expect(parseRemoteFollowTarget("http://remote:8081/channels/films")).toEqual({
      actor_url: "http://remote:8081/channels/films",
    });
  });

  it("rejects input that is neither a handle nor a URL", () => {
    expect(parseRemoteFollowTarget("")).toBeNull();
    expect(parseRemoteFollowTarget("   ")).toBeNull();
    expect(parseRemoteFollowTarget("films")).toBeNull();
    expect(parseRemoteFollowTarget("films@")).toBeNull();
    expect(parseRemoteFollowTarget("@videos.example")).toBeNull();
    expect(parseRemoteFollowTarget("a@b@c.example")).toBeNull();
    expect(parseRemoteFollowTarget("films@localhost")).toBeNull();
    expect(parseRemoteFollowTarget("ftp://videos.example/actor")).toBeNull();
    expect(parseRemoteFollowTarget("name domain.example")).toBeNull();
  });
});
