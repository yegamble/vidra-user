import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  api,
  channelAvatarUrl,
  channelBannerUrl,
  ipfsHlsMasterUrl,
  remoteVideoThumbnailUrl,
  userAvatarUrl,
  userBannerUrl,
  liveHlsMasterUrl,
  videoCaptionUrl,
  videoHlsMasterUrl,
  videoOriginalUrl,
  videoStoryboardImageUrl,
  videoStoryboardVttUrl,
  videoThumbnailUrl,
  playlistThumbnailUrl,
} from "./endpoints";

function okJson(): Response {
  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("api endpoints", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(okJson());
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function calledUrl(): string {
    return (fetchMock.mock.calls[0] as [string])[0];
  }

  it("getFeed targets the feed with sort + pagination", async () => {
    await api.getFeed({ sort: "trending", limit: 10 });
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/videos?sort=trending&limit=10");
  });

  it("getFeed passes the offset for subsequent pages", async () => {
    await api.getFeed({ sort: "popular", limit: 20, offset: 20 });
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/videos?sort=popular&limit=20&offset=20");
  });

  it("getFeed passes the tag/category/language filters, encoded", async () => {
    await api.getFeed({ sort: "recent", tag: "cats & dogs", category: "7", language: "en" });
    expect(calledUrl()).toBe(
      "http://localhost:8080/api/v1/videos?sort=recent&tag=cats+%26+dogs&category=7&language=en",
    );
  });

  it("getFeed omits unset filters entirely", async () => {
    await api.getFeed({ sort: "recent", limit: 20 });
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/videos?sort=recent&limit=20");
  });

  it("searchVideos encodes the query", async () => {
    await api.searchVideos("go lang");
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/videos/search?q=go+lang");
  });

  it("searchVideos passes pagination through", async () => {
    await api.searchVideos("go", { limit: 20, offset: 40 });
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/videos/search?q=go&limit=20&offset=40");
  });

  it("searchVideos passes the category/language/tag filters, encoded", async () => {
    await api.searchVideos("go", { category: "7", language: "en", tag: "cats & dogs" });
    expect(calledUrl()).toBe(
      "http://localhost:8080/api/v1/videos/search?q=go&tag=cats+%26+dogs&category=7&language=en",
    );
  });

  it("searchVideos omits unset filters entirely", async () => {
    await api.searchVideos("go", { limit: 20 });
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/videos/search?q=go&limit=20");
  });

  it("getChannel encodes the handle in the path", async () => {
    await api.getChannel("ada makes");
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/channels/ada%20makes");
  });

  it("getVideo targets the detail endpoint", async () => {
    await api.getVideo("v1");
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/videos/v1");
  });

  it("getVideoConfig targets the video-config endpoint", async () => {
    await api.getVideoConfig();
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/videos/config");
  });

  it("getInstanceAbout targets the instance about endpoint", async () => {
    await api.getInstanceAbout();
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/instance/about");
  });

  it("contactInstance posts the visitor message", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 202 }));
    await api.contactInstance({
      from_name: "Ada",
      from_email: "ada@example.test",
      subject: "Hello",
      body: "This is a thoughtful message.",
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/instance/contact");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      from_name: "Ada",
      from_email: "ada@example.test",
      subject: "Hello",
      body: "This is a thoughtful message.",
    });
  });

  it("media URL helpers build direct stream/poster/caption URLs", () => {
    expect(videoOriginalUrl("v1")).toBe("http://localhost:8080/api/v1/videos/v1/original");
    expect(videoThumbnailUrl("v1")).toBe("http://localhost:8080/api/v1/videos/v1/thumbnail");
    expect(videoCaptionUrl("v1", "pt-BR")).toBe(
      "http://localhost:8080/api/v1/videos/v1/captions/pt-BR",
    );
    expect(videoStoryboardVttUrl("v1")).toBe(
      "http://localhost:8080/api/v1/videos/v1/storyboard.vtt",
    );
    expect(videoStoryboardImageUrl("v1")).toBe(
      "http://localhost:8080/api/v1/videos/v1/storyboard.jpg",
    );
    expect(playlistThumbnailUrl("p1")).toBe("http://localhost:8080/api/v1/playlists/p1/thumbnail");
  });

  it("videoHlsMasterUrl builds the master-playlist URL with the id encoded", () => {
    expect(videoHlsMasterUrl("v1")).toBe(
      "http://localhost:8080/api/v1/videos/v1/hls/master.m3u8",
    );
    expect(videoHlsMasterUrl("a/b")).toBe(
      "http://localhost:8080/api/v1/videos/a%2Fb/hls/master.m3u8",
    );
    expect(
      videoHlsMasterUrl("v1", null, "/api/v1/videos/v1/hls/master.m3u8?v=generation-1"),
    ).toBe("http://localhost:8080/api/v1/videos/v1/hls/master.m3u8?v=generation-1");
  });

  it("media URL helpers append a ?pt= playback token (CORE-17) when one is passed", () => {
    // The token rides on the media reads a header cannot: progressive/native-HLS
    // src, poster, captions, storyboard. It is URL-encoded and placed as a query.
    expect(videoOriginalUrl("v1", "tok/1")).toBe(
      "http://localhost:8080/api/v1/videos/v1/original?pt=tok%2F1",
    );
    expect(videoHlsMasterUrl("v1", "tok1")).toBe(
      "http://localhost:8080/api/v1/videos/v1/hls/master.m3u8?pt=tok1",
    );
    expect(
      videoHlsMasterUrl(
        "v1",
        "tok1",
        "/api/v1/videos/v1/hls/master.m3u8?v=generation-1",
      ),
    ).toBe(
      "http://localhost:8080/api/v1/videos/v1/hls/master.m3u8?v=generation-1&pt=tok1",
    );
    expect(videoThumbnailUrl("v1", "tok1")).toBe(
      "http://localhost:8080/api/v1/videos/v1/thumbnail?pt=tok1",
    );
    expect(videoCaptionUrl("v1", "en", "tok1")).toBe(
      "http://localhost:8080/api/v1/videos/v1/captions/en?pt=tok1",
    );
    expect(videoStoryboardVttUrl("v1", "tok1")).toBe(
      "http://localhost:8080/api/v1/videos/v1/storyboard.vtt?pt=tok1",
    );
    expect(videoStoryboardImageUrl("v1", "tok1")).toBe(
      "http://localhost:8080/api/v1/videos/v1/storyboard.jpg?pt=tok1",
    );
  });

  it("media URL helpers omit the query when the token is absent/empty/null", () => {
    expect(videoOriginalUrl("v1")).toBe("http://localhost:8080/api/v1/videos/v1/original");
    expect(videoOriginalUrl("v1", null)).toBe("http://localhost:8080/api/v1/videos/v1/original");
    expect(videoOriginalUrl("v1", "")).toBe("http://localhost:8080/api/v1/videos/v1/original");
  });

  it("unlockVideo POSTs the password to the unlock endpoint", async () => {
    await api.unlockVideo("v1", "hunter2");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/videos/v1/unlock");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ password: "hunter2" });
  });

  it("password management hits the owner endpoints (list/add/replace/delete)", async () => {
    // Re-arm a FRESH Response per call (a single shared Response's body can only
    // be read once — this test makes several calls).
    fetchMock.mockImplementation(async () => okJson());

    await api.listVideoPasswords("v1");
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
      "http://localhost:8080/api/v1/videos/v1/passwords",
    );

    fetchMock.mockClear();
    await api.addVideoPassword("v1", "secret9");
    let init = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ password: "secret9" });

    fetchMock.mockClear();
    await api.replaceVideoPasswords("v1", ["one-pass", "two-pass"]);
    init = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ passwords: ["one-pass", "two-pass"] });

    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await api.deleteVideoPassword("v1", "pw1");
    const [url, del] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/videos/v1/passwords/pw1");
    expect(del.method).toBe("DELETE");
  });

  it("embed-privacy reads and writes the policy endpoint", async () => {
    fetchMock.mockImplementation(async () => okJson());

    await api.getVideoEmbedPrivacy("v1");
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
      "http://localhost:8080/api/v1/videos/v1/embed-privacy",
    );

    fetchMock.mockClear();
    await api.setVideoEmbedPrivacy("v1", { status: "whitelist", allowed_domains: ["example.com"] });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/videos/v1/embed-privacy");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({
      status: "whitelist",
      allowed_domains: ["example.com"],
    });
  });

  it("ipfsHlsMasterUrl builds a content-addressed gateway URL, or null when unpinned", () => {
    expect(
      ipfsHlsMasterUrl({ gateway_url: "https://ipfs.example.org", hls_cid: "bafyCID" }),
    ).toBe("https://ipfs.example.org/ipfs/bafyCID/master.m3u8");
    // Trailing slashes on the gateway are trimmed (no double slash).
    expect(
      ipfsHlsMasterUrl({ gateway_url: "https://ipfs.example.org/", hls_cid: "bafyCID" }),
    ).toBe("https://ipfs.example.org/ipfs/bafyCID/master.m3u8");
    // Either field missing (HLS tree not pinned / IPFS off) ⇒ no IPFS source.
    expect(ipfsHlsMasterUrl({ gateway_url: "https://ipfs.example.org" })).toBeNull();
    expect(ipfsHlsMasterUrl({ hls_cid: "bafyCID" })).toBeNull();
    expect(ipfsHlsMasterUrl(undefined)).toBeNull();
  });

  it("liveHlsMasterUrl builds the live master-playlist URL with the id encoded", () => {
    expect(liveHlsMasterUrl("ls1")).toBe(
      "http://localhost:8080/api/v1/live/ls1/hls/master.m3u8",
    );
    expect(liveHlsMasterUrl("a/b")).toBe(
      "http://localhost:8080/api/v1/live/a%2Fb/hls/master.m3u8",
    );
  });

  it("liveHlsMasterUrl prefers the playlist the session advertised, and carries a live token", () => {
    expect(liveHlsMasterUrl("ls1", null, "/api/v1/live/ls1/hls/master.m3u8")).toBe(
      "http://localhost:8080/api/v1/live/ls1/hls/master.m3u8",
    );
    // A PRIVATE stream's token rides as `?pt=` — the API rewrites the rolling
    // playlist's segment URIs to keep it, since relative resolution would drop it.
    expect(liveHlsMasterUrl("ls1", "pt-live")).toBe(
      "http://localhost:8080/api/v1/live/ls1/hls/master.m3u8?pt=pt-live",
    );
    // ...and a public stream gets no credential at all.
    expect(liveHlsMasterUrl("ls1", null)).not.toContain("pt=");
  });

  it("createVideoPlaybackSession POSTs, carrying an unlock token as a bearer", async () => {
    await api.createVideoPlaybackSession("v1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/videos/v1/playback-session");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBeUndefined();

    fetchMock.mockResolvedValue(okJson());
    await api.createVideoPlaybackSession("v1", "pt-unlock");
    const [, authed] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect((authed.headers as Record<string, string>).authorization).toBe("Bearer pt-unlock");
  });

  it("createLivePlaybackSession POSTs to the live endpoint", async () => {
    await api.createLivePlaybackSession("ls1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/live/ls1/playback-session");
    expect(init.method).toBe("POST");
  });

  it("postQoEEvents batches to the beacon endpoint without the browse session header", async () => {
    // The QoE endpoint correlates on the playback session id; the browse
    // `X-Vidra-Session` the search beacon sends is identity it never asked for.
    await api.postQoEEvents(
      [
        {
          type: "playback.start",
          video_id: "v1",
          engine: "hls-js",
          packaging_format: "cmaf",
          ttff_ms: 900,
        },
      ],
      { keepalive: true },
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/qoe/events");
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
    expect((init.headers as Record<string, string>)["X-Vidra-Session"]).toBeUndefined();
    expect(JSON.parse(init.body as string).events).toHaveLength(1);
  });

  it("getWatchHistory targets the history endpoint with pagination", async () => {
    await api.getWatchHistory({ limit: 5 });
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/me/history?limit=5");
  });

  it("recordWatchProgress PUTs the position to the watch-progress endpoint", async () => {
    await api.recordWatchProgress("v1", 42);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/videos/v1/watch-progress");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ position_seconds: 42 });
  });

  it("getWatchProgress targets the watch-progress endpoint", async () => {
    await api.getWatchProgress("v1");
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/videos/v1/watch-progress");
  });

  it("recordVideoView POSTs to the video view endpoint", async () => {
    await api.recordVideoView("v1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/videos/v1/view");
    expect(init.method).toBe("POST");
  });

  it("recordVideoView encodes the video id in the path", async () => {
    await api.recordVideoView("a/b");
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/videos/a%2Fb/view");
  });

  it("deleteHistoryEntry DELETEs a single history entry", async () => {
    await api.deleteHistoryEntry("v1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/me/history/v1");
    expect(init.method).toBe("DELETE");
  });

  it("clearWatchHistory DELETEs the whole history", async () => {
    await api.clearWatchHistory();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/me/history");
    expect(init.method).toBe("DELETE");
  });

  it("getNotifications targets the inbox with the unread filter", async () => {
    await api.getNotifications({ unread: true, limit: 10 });
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/me/notifications?unread=true&limit=10");
  });

  it("getUnreadNotificationCount targets the count endpoint", async () => {
    await api.getUnreadNotificationCount();
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/me/notifications/unread-count");
  });

  it("markNotificationRead POSTs to the per-notification read endpoint", async () => {
    await api.markNotificationRead("n1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/me/notifications/n1/read");
    expect(init.method).toBe("POST");
  });

  it("markAllNotificationsRead POSTs to the read-all endpoint", async () => {
    await api.markAllNotificationsRead();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/me/notifications/read-all");
    expect(init.method).toBe("POST");
  });

  it("getMyPlaylists targets the playlists endpoint", async () => {
    await api.getMyPlaylists();
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/me/playlists");
  });

  it("createPlaylist POSTs the body to /playlists", async () => {
    await api.createPlaylist({ title: "Faves", visibility: "public" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/playlists");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ title: "Faves", visibility: "public" });
  });

  it("getPlaylist targets the detail endpoint", async () => {
    await api.getPlaylist("p1");
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/playlists/p1");
  });

  it("updatePlaylist PATCHes the playlist", async () => {
    await api.updatePlaylist("p1", { title: "Renamed" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/playlists/p1");
    expect(init.method).toBe("PATCH");
  });

  it("deletePlaylist DELETEs the playlist", async () => {
    await api.deletePlaylist("p1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/playlists/p1");
    expect(init.method).toBe("DELETE");
  });

  it("addToPlaylist POSTs the video id", async () => {
    await api.addToPlaylist("p1", "v1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/playlists/p1/videos");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ video_id: "v1" });
  });

  it("removeFromPlaylist DELETEs the item", async () => {
    await api.removeFromPlaylist("p1", "v1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/playlists/p1/videos/v1");
    expect(init.method).toBe("DELETE");
  });

  it("reorderPlaylist PUTs the ordered video ids", async () => {
    await api.reorderPlaylist("p1", ["v2", "v1"]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/playlists/p1/videos");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ video_ids: ["v2", "v1"] });
  });

  it("getMyChannels targets the channels endpoint", async () => {
    await api.getMyChannels();
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/me/channels");
  });

  it("getMyQuota targets the quota endpoint", async () => {
    await api.getMyQuota();
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/me/quota");
  });

  it("createChannel POSTs the body to /channels", async () => {
    await api.createChannel({ handle: "ada_makes", display_name: "Ada Makes" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/channels");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ handle: "ada_makes", display_name: "Ada Makes" });
  });

  it("updateChannel PATCHes the name/description to the channel endpoint", async () => {
    await api.updateChannel("ada_makes", { display_name: "Ada Builds", description: "Now with more." });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/channels/ada_makes");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({
      display_name: "Ada Builds",
      description: "Now with more.",
    });
  });

  it("deleteChannel DELETEs the channel by handle", async () => {
    await api.deleteChannel("ada_makes");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/channels/ada_makes");
    expect(init.method).toBe("DELETE");
  });

  it("getMyStats targets the account stats endpoint", async () => {
    await api.getMyStats();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/me/stats");
    expect(init.method ?? "GET").toBe("GET");
  });

  it("listChannelMembers GETs the channel's members with the handle encoded", async () => {
    await api.listChannelMembers("ada makes");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/channels/ada%20makes/members");
    expect(init.method ?? "GET").toBe("GET");
  });

  it("addChannelMember POSTs the target handle + role to the members endpoint", async () => {
    await api.addChannelMember("ada_makes", { handle: "bob", role: "editor" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/channels/ada_makes/members");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ handle: "bob", role: "editor" });
  });

  it("removeChannelMember DELETEs the member by channel handle + user id", async () => {
    await api.removeChannelMember("ada_makes", "u 1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/channels/ada_makes/members/u%201");
    expect(init.method).toBe("DELETE");
  });

  it("listChannelSyncs GETs the caller's channel-syncs", async () => {
    await api.listChannelSyncs();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/channel-syncs");
    expect(init.method ?? "GET").toBe("GET");
  });

  it("createChannelSync POSTs the channel id + external URL", async () => {
    await api.createChannelSync({
      channel_id: "c1",
      external_channel_url: "https://www.youtube.com/@example",
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/channel-syncs");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      channel_id: "c1",
      external_channel_url: "https://www.youtube.com/@example",
    });
  });

  it("deleteChannelSync DELETEs the sync by id (encoded)", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await api.deleteChannelSync("s 1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/channel-syncs/s%201");
    expect(init.method).toBe("DELETE");
  });

  it("syncChannelNow POSTs to the sync's sync-now endpoint (202)", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 202 }));
    await api.syncChannelNow("s1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/channel-syncs/s1/sync-now");
    expect(init.method).toBe("POST");
  });

  it("listMyDonationAddresses targets the caller's donation-addresses endpoint", async () => {
    await api.listMyDonationAddresses();
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/me/donation-addresses");
  });

  it("addDonationAddress POSTs the body to the donation-addresses endpoint", async () => {
    await api.addDonationAddress({
      network: "ethereum",
      address: "0x52908400098527886E0F7030069857D2E4169EE7",
      label: "Tips",
      channel_id: "c1",
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/me/donation-addresses");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      network: "ethereum",
      address: "0x52908400098527886E0F7030069857D2E4169EE7",
      label: "Tips",
      channel_id: "c1",
    });
  });

  it("deleteDonationAddress DELETEs the address by id (encoded)", async () => {
    await api.deleteDonationAddress("d 1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/me/donation-addresses/d%201");
    expect(init.method).toBe("DELETE");
  });

  it("challengeDonationAddress POSTs to the address's challenge endpoint", async () => {
    await api.challengeDonationAddress("d1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/me/donation-addresses/d1/challenge");
    expect(init.method).toBe("POST");
  });

  it("verifyDonationAddress POSTs the signature to the verify endpoint", async () => {
    await api.verifyDonationAddress("d1", { signature: "0xsig" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/me/donation-addresses/d1/verify");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ signature: "0xsig" });
  });

  it("listUserDonationAddresses targets the public user donation-addresses endpoint", async () => {
    await api.listUserDonationAddresses("u1");
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/users/u1/donation-addresses");
  });

  it("listChannelDonationAddresses targets the public channel donation-addresses endpoint", async () => {
    await api.listChannelDonationAddresses("ada_makes");
    expect(calledUrl()).toBe(
      "http://localhost:8080/api/v1/channels/ada_makes/donation-addresses",
    );
  });

  it("createVideoDraft POSTs to the channel's videos endpoint", async () => {
    await api.createVideoDraft("ada_makes", { title: "Hi", privacy: "public" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/channels/ada_makes/videos");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ title: "Hi", privacy: "public" });
  });

  it("getVideoComments targets a video's comments with pagination", async () => {
    await api.getVideoComments("v1", { limit: 100 });
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/videos/v1/comments?limit=100");
  });

  it("postComment POSTs the body to a video's comments (no parent_id for a top-level comment)", async () => {
    await api.postComment("v1", "great video");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/videos/v1/comments");
    expect(init.method).toBe("POST");
    const parsed = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(parsed).toEqual({ body: "great video" });
    // A top-level comment must not send a parent_id key at all.
    expect(parsed).not.toHaveProperty("parent_id");
  });

  it("postComment sends parent_id when replying to another comment", async () => {
    await api.postComment("v1", "nice point", "c1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/videos/v1/comments");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ body: "nice point", parent_id: "c1" });
  });

  it("postComment percent-encodes the video id in the path", async () => {
    await api.postComment("v/1", "hi", "c 1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/videos/v%2F1/comments");
    expect(JSON.parse(init.body as string)).toEqual({ body: "hi", parent_id: "c 1" });
  });

  it("pinComment PUTs to a comment's pin endpoint", async () => {
    await api.pinComment("c1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/comments/c1/pin");
    expect(init.method).toBe("PUT");
  });

  it("unpinComment DELETEs a comment's pin endpoint (encoding the id)", async () => {
    await api.unpinComment("c/1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/comments/c%2F1/pin");
    expect(init.method).toBe("DELETE");
  });

  it("heartComment PUTs to a comment's heart endpoint", async () => {
    await api.heartComment("c1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/comments/c1/heart");
    expect(init.method).toBe("PUT");
  });

  it("unheartComment DELETEs a comment's heart endpoint (encoding the id)", async () => {
    await api.unheartComment("c/1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/comments/c%2F1/heart");
    expect(init.method).toBe("DELETE");
  });

  it("reportVideo POSTs the reason to the video report endpoint", async () => {
    await api.reportVideo("v1", "spam");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/videos/v1/report");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ reason: "spam" });
  });

  it("reportComment POSTs the reason to the comment report endpoint", async () => {
    await api.reportComment("c1", "abuse");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/comments/c1/report");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ reason: "abuse" });
  });

  it("reportAccount POSTs the reason to the user report endpoint", async () => {
    await api.reportAccount("u1", "impersonation");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/users/u1/report");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ reason: "impersonation" });
  });

  it("updateVideo PATCHes the metadata to the video endpoint", async () => {
    await api.updateVideo("v1", { title: "New title", privacy: "unlisted" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/videos/v1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ title: "New title", privacy: "unlisted" });
  });

  it("deleteVideo DELETEs the video", async () => {
    await api.deleteVideo("v1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/videos/v1");
    expect(init.method).toBe("DELETE");
  });

  it("uploadVideoFile POSTs multipart form data via XHR (no JSON content-type)", async () => {
    // The one XHR-based call (byte-level progress; see lib/api/upload.ts) —
    // stub a minimal XMLHttpRequest instead of fetch.
    class FakeXHR {
      static last: FakeXHR | null = null;
      method = "";
      url = "";
      headers: Record<string, string> = {};
      body: unknown = undefined;
      status = 0;
      responseText = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      upload: { onprogress: ((e: unknown) => void) | null } = { onprogress: null };
      constructor() {
        FakeXHR.last = this;
      }
      open(method: string, url: string): void {
        this.method = method;
        this.url = url;
      }
      setRequestHeader(name: string, value: string): void {
        this.headers[name.toLowerCase()] = value;
      }
      send(body?: unknown): void {
        this.body = body;
      }
      abort(): void {
        this.onabort?.();
      }
    }
    vi.stubGlobal("XMLHttpRequest", FakeXHR);

    const file = new File(["x"], "clip.mp4", { type: "video/mp4" });
    const promise = api.uploadVideoFile("v1", file);
    const xhr = FakeXHR.last as FakeXHR;
    expect(xhr.url).toBe("http://localhost:8080/api/v1/videos/v1/file");
    expect(xhr.method).toBe("POST");
    expect(xhr.body).toBeInstanceOf(FormData);
    expect((xhr.body as FormData).get("file")).toBeInstanceOf(File);
    expect(xhr.headers["content-type"]).toBeUndefined();
    xhr.status = 200;
    xhr.responseText = JSON.stringify({ video: { id: "v1" } });
    xhr.onload?.();
    await expect(promise).resolves.toMatchObject({ video: { id: "v1" } });
  });

  it("createLiveStream POSTs the metadata to the channel live endpoint", async () => {
    await api.createLiveStream("ada", {
      title: "Show",
      permanent: true,
      privacy: "public",
      replay_enabled: false,
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/channels/ada/live");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      title: "Show",
      permanent: true,
      privacy: "public",
      replay_enabled: false,
    });
  });

  it("getLiveStreams targets the channel live list", async () => {
    await api.getLiveStreams("ada");
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/channels/ada/live");
  });

  it("regenerateLiveStreamKey POSTs to the key endpoint", async () => {
    await api.regenerateLiveStreamKey("s1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/live/s1/key");
    expect(init.method).toBe("POST");
  });

  it("deleteLiveStream DELETEs the live stream", async () => {
    await api.deleteLiveStream("s1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/live/s1");
    expect(init.method).toBe("DELETE");
  });

  it("getLiveStream targets the single live-stream endpoint", async () => {
    await api.getLiveStream("s1");
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/live/s1");
  });

  it("updateLiveStream PATCHes the metadata (incl. replay_enabled)", async () => {
    await api.updateLiveStream("s1", {
      title: "Show",
      replay_enabled: true,
      privacy: "public",
      permanent: false,
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/live/s1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({
      title: "Show",
      replay_enabled: true,
      privacy: "public",
      permanent: false,
    });
  });

  it("importVideoFile POSTs the url + default resolver to the import endpoint (async job)", async () => {
    await api.importVideoFile("v1", "https://example.com/clip.mp4");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/videos/v1/import");
    expect(init.method).toBe("POST");
    // The UI never guesses the fetch mechanism — it always sends resolver "auto".
    expect(JSON.parse(init.body as string)).toEqual({
      url: "https://example.com/clip.mp4",
      resolver: "auto",
    });
  });

  it("getVideoImport GETs the import status endpoint", async () => {
    await api.getVideoImport("v1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/videos/v1/import");
    expect(init.method ?? "GET").toBe("GET");
  });

  it("createUploadSession POSTs the size/filename to the upload-session endpoint", async () => {
    await api.createUploadSession("v1", { size: 1024, filename: "clip.mp4" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/videos/v1/upload-session");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ size: 1024, filename: "clip.mp4" });
  });

  it("getUploadSession GETs the resume-status endpoint", async () => {
    await api.getUploadSession("up1");
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/uploads/up1");
  });

  it("cancelUploadSession DELETEs the session endpoint", async () => {
    await api.cancelUploadSession("up1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/uploads/up1");
    expect(init.method).toBe("DELETE");
  });

  it("completeUploadSession POSTs the complete endpoint", async () => {
    await api.completeUploadSession("up1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/uploads/up1/complete");
    expect(init.method).toBe("POST");
  });

  it("setPlaylistThumbnail POSTs multipart to the playlist thumbnail endpoint", async () => {
    const file = new File(["img"], "cover.png", { type: "image/png" });
    await api.setPlaylistThumbnail("p1", file);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("http://localhost:8080/api/v1/playlists/p1/thumbnail");
    expect(init.method).toBe("POST");
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
    expect(init.headers["content-type"]).toBeUndefined();
  });

  it("deletePlaylistThumbnail DELETEs the playlist thumbnail endpoint", async () => {
    await api.deletePlaylistThumbnail("p1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/playlists/p1/thumbnail");
    expect(init.method).toBe("DELETE");
  });

  it("setVideoThumbnail POSTs multipart to the thumbnail endpoint", async () => {
    const file = new File(["img"], "poster.png", { type: "image/png" });
    await api.setVideoThumbnail("v1", file);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("http://localhost:8080/api/v1/videos/v1/thumbnail");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
    expect(init.headers["content-type"]).toBeUndefined();
  });

  it("setVideoThumbnailFrame POSTs JSON {at_seconds} to the thumbnail endpoint", async () => {
    await api.setVideoThumbnailFrame("v1", 12.5);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { headers: Record<string, string> },
    ];
    expect(url).toBe("http://localhost:8080/api/v1/videos/v1/thumbnail");
    expect(init.method).toBe("POST");
    expect(init.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ at_seconds: 12.5 });
  });

  it("setMyAvatar POSTs multipart to the account avatar endpoint", async () => {
    const file = new File(["img"], "face.png", { type: "image/png" });
    await api.setMyAvatar(file);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("http://localhost:8080/api/v1/me/avatar");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
    expect(init.headers["content-type"]).toBeUndefined();
  });

  it("deleteMyAvatar DELETEs the account avatar endpoint", async () => {
    await api.deleteMyAvatar();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/me/avatar");
    expect(init.method).toBe("DELETE");
  });

  it("setMyBanner POSTs multipart to the account banner endpoint", async () => {
    const file = new File(["img"], "wide.png", { type: "image/png" });
    await api.setMyBanner(file);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/me/banner");
    expect(init.method).toBe("POST");
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
  });

  it("deleteMyBanner DELETEs the account banner endpoint", async () => {
    await api.deleteMyBanner();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/me/banner");
    expect(init.method).toBe("DELETE");
  });

  it("setChannelAvatar POSTs multipart with the handle encoded", async () => {
    const file = new File(["img"], "face.png", { type: "image/png" });
    await api.setChannelAvatar("ada makes", file);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/channels/ada%20makes/avatar");
    expect(init.method).toBe("POST");
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
  });

  it("deleteChannelAvatar DELETEs the channel avatar endpoint", async () => {
    await api.deleteChannelAvatar("ada_makes");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/channels/ada_makes/avatar");
    expect(init.method).toBe("DELETE");
  });

  it("setChannelBanner POSTs multipart to the channel banner endpoint", async () => {
    const file = new File(["img"], "wide.png", { type: "image/png" });
    await api.setChannelBanner("ada_makes", file);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/channels/ada_makes/banner");
    expect(init.method).toBe("POST");
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
  });

  it("deleteChannelBanner DELETEs the channel banner endpoint", async () => {
    await api.deleteChannelBanner("ada_makes");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/channels/ada_makes/banner");
    expect(init.method).toBe("DELETE");
  });

  it("profile-image URL helpers build the public serve URLs", () => {
    expect(userAvatarUrl("u1")).toBe("http://localhost:8080/api/v1/users/u1/avatar");
    expect(userBannerUrl("u1")).toBe("http://localhost:8080/api/v1/users/u1/banner");
    expect(channelAvatarUrl("ada makes")).toBe(
      "http://localhost:8080/api/v1/channels/ada%20makes/avatar",
    );
    expect(channelBannerUrl("ada_makes")).toBe(
      "http://localhost:8080/api/v1/channels/ada_makes/banner",
    );
  });

  it("getReports defaults to all reports (no status filter)", async () => {
    await api.getReports();
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/admin/reports");
  });

  it("getReports adds status=open when openOnly is set", async () => {
    await api.getReports({ openOnly: true, limit: 100 });
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/admin/reports?status=open&limit=100");
  });

  it("resolveReport POSTs the status + note to the resolve endpoint", async () => {
    await api.resolveReport("r1", { status: "accepted", note: "spam" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/admin/reports/r1/resolve");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ status: "accepted", note: "spam" });
  });

  it("getAdminStats targets the instance-overview stats endpoint", async () => {
    await api.getAdminStats();
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/admin/stats");
  });

  it("getAdminUsers targets the admin users endpoint with the q filter", async () => {
    await api.getAdminUsers({ q: "ada", limit: 100 });
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/admin/users?q=ada&limit=100");
  });

  it("getAdminUsers omits q when not provided", async () => {
    await api.getAdminUsers();
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/admin/users");
  });

  it("getRegistrationRequests targets the queue with the pending filter", async () => {
    await api.getRegistrationRequests({ status: "pending", limit: 100 });
    expect(calledUrl()).toBe(
      "http://localhost:8080/api/v1/admin/registration-requests?status=pending&limit=100",
    );
  });

  it("getRegistrationRequests omits the status filter when not provided", async () => {
    await api.getRegistrationRequests();
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/admin/registration-requests");
  });

  it("approveRegistrationRequest POSTs to the approve endpoint", async () => {
    await api.approveRegistrationRequest("r1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/admin/registration-requests/r1/approve");
    expect(init.method).toBe("POST");
  });

  it("rejectRegistrationRequest POSTs the optional note to the reject endpoint", async () => {
    await api.rejectRegistrationRequest("r1", { note: "spam signup" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/admin/registration-requests/r1/reject");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ note: "spam signup" });
  });

  it("rejectRegistrationRequest sends an empty body when no note is given", async () => {
    await api.rejectRegistrationRequest("r1");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({});
  });

  it("getAuditLog targets the audit-log endpoint with the action filter", async () => {
    await api.getAuditLog({ action: "auth.login", limit: 100 });
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/admin/audit-log?action=auth.login&limit=100");
  });

  it("getAuditLog omits the action filter when not provided", async () => {
    await api.getAuditLog();
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/admin/audit-log");
  });

  it("getSystemStatus targets the admin system endpoint", async () => {
    await api.getSystemStatus();
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/admin/system");
  });

  it("getStorageMigrations targets the campaign list", async () => {
    await api.getStorageMigrations();
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/admin/storage/migrations");
  });

  it("getStorageMigration targets one campaign by id", async () => {
    await api.getStorageMigration("11111111-1111-1111-1111-111111111111");
    expect(calledUrl()).toBe(
      "http://localhost:8080/api/v1/admin/storage/migrations/11111111-1111-1111-1111-111111111111",
    );
  });

  it("updateAdminUser PATCHes the role / active flag", async () => {
    await api.updateAdminUser("u1", { role: "moderator", is_active: false });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/admin/users/u1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ role: "moderator", is_active: false });
  });

  it("deleteAdminUser DELETEs the user by id (no body — no password confirm)", async () => {
    await api.deleteAdminUser("u2");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/admin/users/u2");
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
  });

  it("getBlockedVideos targets the block-list endpoint with pagination", async () => {
    await api.getBlockedVideos({ limit: 100 });
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/admin/videos/blocked?limit=100");
  });

  it("unblockVideo DELETEs the block for the video", async () => {
    await api.unblockVideo("v1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/admin/videos/v1/block");
    expect(init.method).toBe("DELETE");
  });

  it("blockVideo POSTs the block with the reason", async () => {
    await api.blockVideo("v1", { reason: "copyright" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/admin/videos/v1/block");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ reason: "copyright" });
  });

  it("muteAccount POSTs to the mute endpoint for the user", async () => {
    await api.muteAccount("u2");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/me/mutes/accounts/u2");
    expect(init.method).toBe("POST");
  });

  it("unmuteAccount DELETEs the mute for the user", async () => {
    await api.unmuteAccount("u2");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/me/mutes/accounts/u2");
    expect(init.method).toBe("DELETE");
  });

  it("getMutedAccounts targets the mutes endpoint with pagination", async () => {
    await api.getMutedAccounts({ limit: 100 });
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/me/mutes/accounts?limit=100");
  });

  it("startConversation POSTs the recipient id to the conversations endpoint", async () => {
    await api.startConversation("u2");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/conversations");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ recipient_id: "u2" });
  });

  it("getConversations targets the inbox endpoint with pagination", async () => {
    await api.getConversations({ limit: 20 });
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/me/conversations?limit=20");
  });

  it("getMessages targets a conversation's messages with pagination", async () => {
    await api.getMessages("c1", { limit: 50 });
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/conversations/c1/messages?limit=50");
  });

  it("sendMessage POSTs the body to a conversation's messages", async () => {
    await api.sendMessage("c1", "hi");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/conversations/c1/messages");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ body: "hi" });
  });

  it("startConversation adds encrypted:true when starting an encrypted thread", async () => {
    await api.startConversation("u2", { encrypted: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/conversations");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ recipient_id: "u2", encrypted: true });
  });

  it("startConversation POSTs recipient_username for the username (compose) form", async () => {
    await api.startConversation({ recipientUsername: "bob" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/conversations");
    expect(init.method).toBe("POST");
    // Exactly one identifier — the username — and no recipient_id key.
    expect(JSON.parse(init.body as string)).toEqual({ recipient_username: "bob" });
  });

  it("startConversation carries encrypted:true in the object (username) form", async () => {
    await api.startConversation({ recipientUsername: "bob", encrypted: true });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      recipient_username: "bob",
      encrypted: true,
    });
  });

  it("getConversationMessages targets a conversation's messages (union endpoint)", async () => {
    await api.getConversationMessages("c1", { limit: 50 });
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/conversations/c1/messages?limit=50");
  });

  it("sendEncryptedMessage POSTs the envelopes + timer to the messages endpoint", async () => {
    await api.sendEncryptedMessage("c1", {
      sender_device_id: "d1",
      envelopes: [{ recipient_device_id: "d2", message_type: 0, ciphertext: "xx" }],
      expires_in_seconds: 3600,
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/conversations/c1/messages");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      sender_device_id: "d1",
      envelopes: [{ recipient_device_id: "d2", message_type: 0, ciphertext: "xx" }],
      expires_in_seconds: 3600,
    });
  });

  it("sendMessage includes attachment_ids when attachments are attached", async () => {
    await api.sendMessage("c1", "hi", ["a1", "a2"]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/conversations/c1/messages");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ body: "hi", attachment_ids: ["a1", "a2"] });
  });

  it("sendMessage omits an empty body when sending attachments only", async () => {
    await api.sendMessage("c1", "", ["a1"]);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ attachment_ids: ["a1"] });
  });

  it("uploadDMAttachment POSTs multipart to the conversation attachments endpoint", async () => {
    const file = new File(["bytes"], "photo.png", { type: "image/png" });
    await api.uploadDMAttachment("c1", file);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { headers: Record<string, string> },
    ];
    expect(url).toBe("http://localhost:8080/api/v1/conversations/c1/attachments");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
    expect(init.headers["content-type"]).toBeUndefined();
  });

  it("fetchAttachment GETs the participant-gated attachment bytes", async () => {
    fetchMock.mockResolvedValueOnce(new Response("bytes", { status: 200 }));
    const blob = await api.fetchAttachment("a1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/attachments/a1");
    expect(init.method ?? "GET").toBe("GET");
    expect(blob).toBeInstanceOf(Blob);
  });

  it("markConversationRead POSTs without a body for the newest-message watermark", async () => {
    await api.markConversationRead("c1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/conversations/c1/read");
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
  });

  it("markConversationRead pins the watermark to a message id when given", async () => {
    await api.markConversationRead("c1", "m9");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ message_id: "m9" });
  });

  it("deleteMessage DELETEs the message endpoint", async () => {
    await api.deleteMessage("m1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/messages/m1");
    expect(init.method).toBe("DELETE");
  });

  it("reportMessage POSTs the reason to the message report endpoint", async () => {
    await api.reportMessage("m1", "abuse");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/messages/m1/report");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ reason: "abuse" });
  });

  it("registerE2EEDevice POSTs the public keys to the devices endpoint", async () => {
    await api.registerE2EEDevice({ device_name: "Laptop", identity_key: "ik", signing_key: "sk" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/e2ee/devices");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      device_name: "Laptop",
      identity_key: "ik",
      signing_key: "sk",
    });
  });

  it("listMyE2EEDevices targets the devices probe endpoint", async () => {
    await api.listMyE2EEDevices();
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/e2ee/devices");
  });

  it("deleteE2EEDevice DELETEs the device by id", async () => {
    await api.deleteE2EEDevice("d1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/e2ee/devices/d1");
    expect(init.method).toBe("DELETE");
  });

  it("uploadE2EEOneTimeKeys POSTs the key batch", async () => {
    await api.uploadE2EEOneTimeKeys("d1", [{ key_id: "k1", key: "otk1" }]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/e2ee/devices/d1/one-time-keys");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      one_time_keys: [{ key_id: "k1", key: "otk1" }],
    });
  });

  it("countE2EEOneTimeKeys GETs the unclaimed count", async () => {
    await api.countE2EEOneTimeKeys("d1");
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/e2ee/devices/d1/one-time-keys/count");
  });

  it("listUserE2EEDevices targets a peer's public devices", async () => {
    await api.listUserE2EEDevices("u2");
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/users/u2/e2ee/devices");
  });

  it("claimE2EEOneTimeKeys POSTs to the user's claim endpoint", async () => {
    await api.claimE2EEOneTimeKeys("u2");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/users/u2/e2ee/claim");
    expect(init.method).toBe("POST");
  });

  it("blockUser POSTs to the blocks endpoint for the user", async () => {
    await api.blockUser("u2");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/me/blocks/u2");
    expect(init.method).toBe("POST");
  });

  it("unblockUser DELETEs the block for the user", async () => {
    await api.unblockUser("u2");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/me/blocks/u2");
    expect(init.method).toBe("DELETE");
  });

  it("getBlockedUsers targets the blocks endpoint with pagination", async () => {
    await api.getBlockedUsers({ limit: 100 });
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/me/blocks?limit=100");
  });

  it("getAdminVideos targets the admin videos overview with the q filter", async () => {
    await api.getAdminVideos({ q: "cat", limit: 100 });
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/admin/videos?q=cat&limit=100");
  });

  it("getAdminVideos omits q when not provided", async () => {
    await api.getAdminVideos();
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/admin/videos");
  });

  it("runVideoTranscoding POSTs the selected recovery target", async () => {
    await api.runVideoTranscoding("v 1", "web_video");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/admin/videos/v%201/transcoding");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ type: "web_video" });
  });

  it("getAdminComments targets the admin comments overview with the q filter", async () => {
    await api.getAdminComments({ q: "spam", limit: 100 });
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/admin/comments?q=spam&limit=100");
  });

  it("getCaptions targets the video captions endpoint", async () => {
    await api.getCaptions("v1");
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/videos/v1/captions");
  });

  it("uploadCaption POSTs multipart with language + file", async () => {
    const file = new File(["WEBVTT"], "cap.vtt", { type: "text/vtt" });
    await api.uploadCaption("v1", { language: "en", label: "English", file });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/videos/v1/captions");
    expect(init.method).toBe("POST");
    const form = init.body as FormData;
    expect(form.get("language")).toBe("en");
    expect(form.get("label")).toBe("English");
    expect(form.get("file")).toBeInstanceOf(File);
  });

  it("deleteCaption DELETEs the language track", async () => {
    await api.deleteCaption("v1", "en");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/videos/v1/captions/en");
    expect(init.method).toBe("DELETE");
  });

  it("requestAutoCaption POSTs the auto-caption endpoint with a language hint", async () => {
    await api.requestAutoCaption("v1", { language: "en" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/videos/v1/captions/auto");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ language: "en" });
  });

  it("requestAutoCaption defaults to an empty body when no hint is given", async () => {
    await api.requestAutoCaption("v1");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({});
  });

  it("getAutoCaption targets the auto-caption status endpoint", async () => {
    await api.getAutoCaption("v1");
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/videos/v1/captions/auto");
  });

  it("getWatchedWords targets the watched-words endpoint with pagination", async () => {
    await api.getWatchedWords({ limit: 100 });
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/admin/watched-words?limit=100");
  });

  it("getWatchedWordMatches targets the watched-word-matches endpoint", async () => {
    await api.getWatchedWordMatches({ limit: 100 });
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/admin/watched-word-matches?limit=100");
  });

  it("addWatchedWord POSTs the word", async () => {
    await api.addWatchedWord("spam");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/admin/watched-words");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ word: "spam" });
  });

  it("deleteWatchedWord DELETEs the word by id", async () => {
    await api.deleteWatchedWord("w1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/admin/watched-words/w1");
    expect(init.method).toBe("DELETE");
  });

  it("getVideoStats targets the video stats endpoint with the id encoded", async () => {
    await api.getVideoStats("v 1");
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/videos/v%201/stats");
  });

  it("getChannelStats targets the channel stats endpoint with the handle encoded", async () => {
    await api.getChannelStats("ada makes");
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/channels/ada%20makes/stats");
  });

  it("getNotificationPrefs targets the notification-prefs endpoint", async () => {
    await api.getNotificationPrefs();
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/me/notification-prefs");
  });

  it("updateNotificationPrefs PATCHes the partial prefs map", async () => {
    await api.updateNotificationPrefs({ follow: false });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/me/notification-prefs");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ prefs: { follow: false } });
  });

  it("getPlayerSettings targets the player-settings endpoint", async () => {
    await api.getPlayerSettings();
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/me/player-settings");
  });

  it("updatePlayerSettings PUTs only the changed field (merge)", async () => {
    await api.updatePlayerSettings({ default_speed: 1.5 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/me/player-settings");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ default_speed: 1.5 });
  });

  it("deleteReport DELETEs the report by id", async () => {
    await api.deleteReport("r1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/admin/reports/r1");
    expect(init.method).toBe("DELETE");
  });

  it("getQuarantinedVideos targets the quarantine queue with pagination", async () => {
    await api.getQuarantinedVideos({ limit: 100 });
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/admin/videos/quarantined?limit=100");
  });

  it("approveQuarantinedVideo POSTs to the approve endpoint", async () => {
    await api.approveQuarantinedVideo("v1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/admin/videos/v1/approve");
    expect(init.method).toBe("POST");
  });

  it("rejectQuarantinedVideo POSTs the optional reason to the reject endpoint", async () => {
    await api.rejectQuarantinedVideo("v1", { reason: "not allowed here" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/admin/videos/v1/reject");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ reason: "not allowed here" });
  });

  it("rejectQuarantinedVideo defaults to an empty body", async () => {
    await api.rejectQuarantinedVideo("v1");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({});
  });

  it("getFeed passes scope=all through and omits it when unset", async () => {
    await api.getFeed({ sort: "recent", scope: "all", limit: 20 });
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/videos?sort=recent&scope=all&limit=20");
  });

  it("getRemoteVideo targets the remote-video detail with the id encoded", async () => {
    await api.getRemoteVideo("r 1");
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/remote-videos/r%201");
  });

  it("remoteVideoThumbnailUrl builds the cached-poster URL", () => {
    expect(remoteVideoThumbnailUrl("r1")).toBe(
      "http://localhost:8080/api/v1/remote-videos/r1/thumbnail",
    );
  });

  it("reportRemoteVideo POSTs the reason to the remote-video report endpoint", async () => {
    await api.reportRemoteVideo("r1", "stolen content");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/remote-videos/r1/report");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ reason: "stolen content" });
  });

  it("getBlockedRemoteVideos targets the remote block-list with pagination", async () => {
    await api.getBlockedRemoteVideos({ limit: 100 });
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/admin/remote-videos/blocked?limit=100");
  });

  it("blockRemoteVideo POSTs the block with the audit reason", async () => {
    await api.blockRemoteVideo("r1", { reason: "reported spam" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/admin/remote-videos/r1/block");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ reason: "reported spam" });
  });

  it("unblockRemoteVideo DELETEs the remote video's block", async () => {
    await api.unblockRemoteVideo("r1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/admin/remote-videos/r1/block");
    expect(init.method).toBe("DELETE");
  });

  it("createRemoteFollow POSTs the handle target", async () => {
    await api.createRemoteFollow({ handle: "films@videos.example" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/me/remote-follows");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ handle: "films@videos.example" });
  });

  it("createRemoteFollow POSTs the actor_url target", async () => {
    await api.createRemoteFollow({ actor_url: "https://videos.example/video-channels/films" });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      actor_url: "https://videos.example/video-channels/films",
    });
  });

  it("listRemoteFollows targets the remote-follows list with pagination", async () => {
    await api.listRemoteFollows({ limit: 100 });
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/me/remote-follows?limit=100");
  });

  it("deleteRemoteFollow DELETEs the follow by row id", async () => {
    await api.deleteRemoteFollow("f1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/me/remote-follows/f1");
    expect(init.method).toBe("DELETE");
  });

  it("getATProtoAccount GETs the linked Bluesky status", async () => {
    await api.getATProtoAccount();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/me/atproto");
    // No explicit method => GET.
    expect(init.method ?? "GET").toBe("GET");
  });

  it("linkATProtoAccount PUTs the handle, app password, and auto-post flag", async () => {
    await api.linkATProtoAccount({
      handle: "alice.bsky.social",
      app_password: "xxxx-xxxx-xxxx-xxxx",
      auto_post: true,
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/me/atproto");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({
      handle: "alice.bsky.social",
      app_password: "xxxx-xxxx-xxxx-xxxx",
      auto_post: true,
    });
  });

  it("linkATProtoAccount forwards an optional custom PDS URL", async () => {
    await api.linkATProtoAccount({
      handle: "alice.example",
      app_password: "yyyy-yyyy-yyyy-yyyy",
      pds_url: "https://pds.example",
      auto_post: false,
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      handle: "alice.example",
      app_password: "yyyy-yyyy-yyyy-yyyy",
      pds_url: "https://pds.example",
      auto_post: false,
    });
  });

  it("unlinkATProtoAccount DELETEs the Bluesky link", async () => {
    await api.unlinkATProtoAccount();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/me/atproto");
    expect(init.method).toBe("DELETE");
  });

  it("muteInstance POSTs to the instance-mute endpoint with the domain encoded", async () => {
    await api.muteInstance("videos.example:8443");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/me/mutes/instances/videos.example%3A8443");
    expect(init.method).toBe("POST");
  });

  it("unmuteInstance DELETEs the instance mute", async () => {
    await api.unmuteInstance("videos.example");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/me/mutes/instances/videos.example");
    expect(init.method).toBe("DELETE");
  });

  it("getMutedInstances targets the instance-mutes list with pagination", async () => {
    await api.getMutedInstances({ limit: 100 });
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/me/mutes/instances?limit=100");
  });

  it("getBlockedInstances targets the admin blocklist with pagination", async () => {
    await api.getBlockedInstances({ limit: 100 });
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/admin/instances/blocked?limit=100");
  });

  it("blockInstance POSTs the domain + reason", async () => {
    await api.blockInstance({ domain: "spam.example", reason: "spam waves" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/admin/instances/blocked");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ domain: "spam.example", reason: "spam waves" });
  });

  it("unblockInstance DELETEs the blocklist entry with the domain encoded", async () => {
    await api.unblockInstance("spam.example:8443");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/admin/instances/blocked/spam.example%3A8443");
    expect(init.method).toBe("DELETE");
  });

  it("getInstanceSettings targets the admin instance-settings endpoint", async () => {
    await api.getInstanceSettings();
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/admin/instance-settings");
  });

  it("updateInstanceSettings PATCHes the flat key→value patch", async () => {
    await api.updateInstanceSettings({ instance_name: "My Vidra", uploads_enabled: false });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/admin/instance-settings");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({
      instance_name: "My Vidra",
      uploads_enabled: false,
    });
  });

  it("updateInstanceSettings sends a null value to clear an override", async () => {
    await api.updateInstanceSettings({ terms_url: null });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ terms_url: null });
  });

  it("setInstanceAvatar POSTs multipart to the admin instance-avatar endpoint (W4)", async () => {
    const file = new File(["img"], "avatar.png", { type: "image/png" });
    await api.setInstanceAvatar(file);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { headers: Record<string, string> },
    ];
    expect(url).toBe("http://localhost:8080/api/v1/admin/instance-avatar");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
    expect(init.headers["content-type"]).toBeUndefined();
  });

  it("deleteInstanceAvatar DELETEs the admin instance-avatar endpoint", async () => {
    await api.deleteInstanceAvatar();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/admin/instance-avatar");
    expect(init.method).toBe("DELETE");
  });

  it("setInstanceBanner POSTs multipart to the admin instance-banner endpoint", async () => {
    const file = new File(["img"], "banner.png", { type: "image/png" });
    await api.setInstanceBanner(file);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/admin/instance-banner");
    expect(init.method).toBe("POST");
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
  });

  it("deleteInstanceBanner DELETEs the admin instance-banner endpoint", async () => {
    await api.deleteInstanceBanner();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/admin/instance-banner");
    expect(init.method).toBe("DELETE");
  });

  it("setInstanceLogo POSTs multipart to the typed logo-slot endpoint", async () => {
    const file = new File(["img"], "wide.png", { type: "image/png" });
    await api.setInstanceLogo("header-wide", file);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/admin/instance-logo/header-wide");
    expect(init.method).toBe("POST");
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
  });

  it("deleteInstanceLogo DELETEs the typed logo-slot endpoint", async () => {
    await api.deleteInstanceLogo("opengraph");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/admin/instance-logo/opengraph");
    expect(init.method).toBe("DELETE");
  });

  it("getJobs targets the admin jobs endpoint", async () => {
    await api.getJobs();
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/admin/jobs");
  });

  it("gets IPFS status and scopes reconciliation to one network", async () => {
    fetchMock.mockImplementation(async () => okJson());
    await api.getIPFSStatus();
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/ipfs/status");

    fetchMock.mockClear();
    await api.reconcileIPFS("private");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/admin/ipfs/reconcile?network=private");
    expect(init.method).toBe("POST");
  });

  it("omits the IPFS network query when reconciling all tiers", async () => {
    await api.reconcileIPFS();
    expect(calledUrl()).toBe("http://localhost:8080/api/v1/admin/ipfs/reconcile");
  });

  it("getJobRuns sends the server-backed operations filters and pagination", async () => {
    await api.getJobRuns({
      state: "failed",
      type: "video.transcode",
      queue: "transcode",
      resourceType: "video",
      resourceId: "video/one",
      workerId: "worker one",
      failure: true,
      createdAfter: "2026-07-01T00:00:00.000Z",
      createdBefore: "2026-07-12T00:00:00.000Z",
      limit: 25,
      offset: 50,
    });
    expect(calledUrl()).toBe(
      "http://localhost:8080/api/v1/admin/jobs/runs?state=failed&type=video.transcode&queue=transcode&resource_type=video&resource_id=video%2Fone&worker_id=worker+one&failure=true&created_after=2026-07-01T00%3A00%3A00.000Z&created_before=2026-07-12T00%3A00%3A00.000Z&limit=25&offset=50",
    );
  });

  it("getJobRuns omits unset filters", async () => {
    await api.getJobRuns({ limit: 25, offset: 0 });
    expect(calledUrl()).toBe(
      "http://localhost:8080/api/v1/admin/jobs/runs?limit=25&offset=0",
    );
  });

  it("getJobRun encodes the id and sends event pagination", async () => {
    await api.getJobRun("run/one", { eventsLimit: 50, eventsOffset: 100 });
    expect(calledUrl()).toBe(
      "http://localhost:8080/api/v1/admin/jobs/runs/run%2Fone?events_limit=50&events_offset=100",
    );
  });

  it("runMediaGC POSTs a dry run by default (dry_run=true)", async () => {
    await api.runMediaGC(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/admin/media/gc");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ dry_run: true });
  });

  it("runMediaGC POSTs dry_run=false for a confirmed purge", async () => {
    await api.runMediaGC(false);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ dry_run: false });
  });

  it("launchPeerTubeImport POSTs the mode + conflict policy (no source credentials)", async () => {
    await api.launchPeerTubeImport({ mode: "dry_run", conflict_policy: "rename" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/admin/peertube-import");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ mode: "dry_run", conflict_policy: "rename" });
  });

  it("launchPeerTubeImport carries an admin's schema sign-off as the version itself", async () => {
    // Not a boolean: the server opens the version gate only when this equals the
    // version preflight actually detects, so the number has to reach the wire.
    await api.launchPeerTubeImport({
      mode: "run",
      conflict_policy: "skip",
      acknowledged_schema_version: 1040,
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      mode: "run",
      conflict_policy: "skip",
      acknowledged_schema_version: 1040,
    });
  });

  it("listPeerTubeImports targets the admin peertube-import collection", async () => {
    await api.listPeerTubeImports();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/admin/peertube-import");
    expect(init.method ?? "GET").toBe("GET");
  });

  it("getPeerTubeImport targets one run by id (encoded)", async () => {
    await api.getPeerTubeImport("11111111-1111-1111-1111-111111111111");
    expect(calledUrl()).toBe(
      "http://localhost:8080/api/v1/admin/peertube-import/11111111-1111-1111-1111-111111111111",
    );
  });
});
