import { describe, expect, it } from "vitest";

import type { RemoteVideo } from "@/lib/api";
import {
  readRemoteSearchResults,
  remoteVideoToCard,
  searchQueryLooksRemote,
} from "@/lib/remote-search";

const videoHit = {
  type: "video",
  video: {
    id: "rv1",
    remote: true,
    domain: "tube.remote.example",
    title: "Remote premiere",
    description: "from afar",
    object_url: "https://tube.remote.example/videos/rv1",
    watch_url: "https://tube.remote.example/w/rv1",
    duration_seconds: 62,
    published_at: "2026-06-01T00:00:00Z",
    has_thumbnail: true,
  },
};

const channelHit = {
  type: "channel",
  actor: {
    actor_url: "https://tube.remote.example/video-channels/movies",
    handle: "movies@tube.remote.example",
    domain: "tube.remote.example",
  },
};

describe("readRemoteSearchResults", () => {
  it("reads typed video and actor hits", () => {
    const out = readRemoteSearchResults({ videos: [], remote: [videoHit, channelHit] });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ type: "video", video: { id: "rv1" } });
    expect(out[1]).toMatchObject({ type: "channel", actor: { domain: "tube.remote.example" } });
  });

  it("tolerates an absent remote field (older backend / gates off / mocked e2e)", () => {
    expect(readRemoteSearchResults({ videos: [] })).toEqual([]);
    expect(readRemoteSearchResults(null)).toEqual([]);
    expect(readRemoteSearchResults(undefined)).toEqual([]);
    expect(readRemoteSearchResults("nope")).toEqual([]);
  });

  it("drops malformed items instead of throwing", () => {
    const out = readRemoteSearchResults({
      remote: [
        null,
        42,
        { type: "video" }, // missing payload
        { type: "video", video: { id: "x" } }, // not remote:true / no title
        { type: "channel", actor: { actor_url: "u" } }, // incomplete actor
        { type: "mystery", actor: channelHit.actor }, // unknown type
        channelHit,
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("channel");
  });

  it("accepts account hits", () => {
    const out = readRemoteSearchResults({
      remote: [{ type: "account", actor: channelHit.actor }],
    });
    expect(out).toEqual([{ type: "account", actor: channelHit.actor }]);
  });
});

describe("remoteVideoToCard", () => {
  it("maps a remote hit onto the remote-card Video shape", () => {
    const card = remoteVideoToCard(videoHit.video as RemoteVideo);
    expect(card.remote).toBe(true);
    expect(card.id).toBe("rv1");
    expect(card.domain).toBe("tube.remote.example");
    expect(card.title).toBe("Remote premiere");
    expect(card.duration_seconds).toBe(62);
    expect(card.has_thumbnail).toBe(true);
    expect(card.created_at).toBe("2026-06-01T00:00:00Z");
  });

  it("tolerates a hit without published_at", () => {
    const { published_at: _dropped, ...rest } = videoHit.video;
    const card = remoteVideoToCard(rest as RemoteVideo);
    expect(card.created_at).toBe("");
  });
});

describe("searchQueryLooksRemote", () => {
  it.each([
    ["https://tube.remote.example/videos/rv1", true],
    ["@movies@tube.remote.example", true],
    ["movies@tube.remote.example", true],
    ["go concurrency patterns", false],
    ["", false],
    ["@only.domain", false],
  ])("%s -> %s", (q, want) => {
    expect(searchQueryLooksRemote(q)).toBe(want);
  });
});
