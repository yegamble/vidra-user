// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RemoteVideo, RemoteVideoCommentListResponse } from "@/lib/api";

// A29 remediation, the follower's half: the origin now advertises a playable
// HLS master on its AS Video, so a federated video must render THIS instance's
// own player against it rather than a link-out.
//
// The fixture is typed as the contract's own RemoteVideo — the type is derived
// from api/openapi.yaml's schema, so a field that leaves or changes shape in
// core breaks this file at compile time rather than passing against a hand-made
// object. That is the whole reason it is typed rather than cast: a mocked test
// against an invented shape is exactly how a feature stays green while being
// unreachable in production.

const mocks = vi.hoisted(() => ({
  getRemoteVideo: vi.fn(),
  getRemoteVideoComments: vi.fn(),
  blockRemoteActor: vi.fn(),
  unblockRemoteActor: vi.fn(),
  useSession: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getRemoteVideo: mocks.getRemoteVideo,
      getRemoteVideoComments: mocks.getRemoteVideoComments,
      blockRemoteActor: mocks.blockRemoteActor,
      unblockRemoteActor: mocks.unblockRemoteActor,
    },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => mocks.useSession(),
}));

import { RemoteWatchView } from "./RemoteWatchView";

const HLS_MASTER = "https://peer.example/api/v1/videos/7a1d9e42-0000-4000-8000-000000000001/hls/master.m3u8";

function remoteVideo(overrides: Partial<RemoteVideo> = {}): RemoteVideo {
  return {
    id: "11111111-2222-4333-8444-555555555555",
    remote: true,
    domain: "peer.example",
    title: "Dawn over the fjord",
    description: "A quiet opening.",
    object_url: "https://peer.example/videos/7a1d9e42-0000-4000-8000-000000000001",
    watch_url: "https://peer.example/v/abcdefghijk",
    has_thumbnail: true,
    duration_seconds: 367,
    published_at: "2026-08-30T08:00:00Z",
    ...overrides,
  };
}

// jsdom has no MSE and its canPlayType answers "" for everything, so an HLS
// master is unplayable there by default and the page would honestly show its
// link-out panel — which would make this file prove nothing about the case the
// whole slice is about. Reporting native HLS support is what a Safari-class
// browser actually does, and it makes the REAL engine selection choose the
// native path and attach the origin's master playlist to a real <video>. The
// hls.js branch cannot be exercised under jsdom at all; lib/remote-playback and
// lib/player-engine cover the selection for it.
function pretendNativeHlsSupport() {
  const proto = window.HTMLMediaElement.prototype;
  const original = proto.canPlayType;
  proto.canPlayType = function canPlayType(type: string) {
    return type === "application/vnd.apple.mpegurl" ? "maybe" : "";
  };
  return () => {
    proto.canPlayType = original;
  };
}

let restoreCanPlayType: (() => void) | null = null;

beforeEach(() => {
  mocks.getRemoteVideo.mockReset();
  mocks.getRemoteVideoComments
    .mockReset()
    .mockResolvedValue({ comments: [], total: 0, limit: 50, offset: 0 });
  mocks.blockRemoteActor.mockReset().mockResolvedValue(undefined);
  mocks.unblockRemoteActor.mockReset().mockResolvedValue(undefined);
  mocks.useSession.mockReturnValue({ status: "anonymous" });
});

afterEach(() => {
  restoreCanPlayType?.();
  restoreCanPlayType = null;
  cleanup();
});

describe("RemoteWatchView playback", () => {
  it("renders a player against the origin's stream when the object advertises one", async () => {
    restoreCanPlayType = pretendNativeHlsSupport();
    mocks.getRemoteVideo.mockResolvedValue(remoteVideo({ stream_url: HLS_MASTER }));
    const { container } = render(<RemoteWatchView id="r1" />);

    await screen.findByRole("heading", { name: "Dawn over the fjord" });
    const player = await waitFor(() => {
      const el = container.querySelector("video");
      expect(el).not.toBeNull();
      return el as HTMLVideoElement;
    });
    // The ORIGIN's master playlist, cross-origin, on this instance's own player
    // — which is only reachable because the origin now answers it with
    // `Access-Control-Allow-Origin: *` (the core half of this slice).
    expect(player.getAttribute("src")).toBe(HLS_MASTER);
    expect(screen.queryByText(/can’t be played here/)).toBeNull();
  });

  it("keeps the watch-on-origin link even when it can play the stream itself", async () => {
    restoreCanPlayType = pretendNativeHlsSupport();
    mocks.getRemoteVideo.mockResolvedValue(remoteVideo({ stream_url: HLS_MASTER }));
    render(<RemoteWatchView id="r1" />);

    const link = await screen.findByRole("link", { name: /Watch on peer\.example/ });
    expect(link.getAttribute("href")).toBe("https://peer.example/v/abcdefghijk");
  });

  it("falls back to the honest panel when the origin advertised no stream", async () => {
    mocks.getRemoteVideo.mockResolvedValue(remoteVideo());
    const { container } = render(<RemoteWatchView id="r1" />);

    await screen.findByText(/can’t be played here/);
    expect(container.querySelector("video")).toBeNull();
    expect(
      await screen.findByRole("link", { name: /Watch on peer\.example/ }),
    ).toBeTruthy();
  });

  it("plays a direct video file too, the other shape the object can advertise", async () => {
    const mp4 = "https://peer.example/api/v1/videos/7a1d9e42-0000-4000-8000-000000000001/original";
    mocks.getRemoteVideo.mockResolvedValue(remoteVideo({ stream_url: mp4 }));
    const { container } = render(<RemoteWatchView id="r1" />);

    await screen.findByRole("heading", { name: "Dawn over the fjord" });
    const player = await waitFor(() => {
      const el = container.querySelector("video");
      expect(el).not.toBeNull();
      return el as HTMLVideoElement;
    });
    expect(player.getAttribute("src")).toBe(mp4);
  });

  it("shows the origin badge and duration from the federated object", async () => {
    restoreCanPlayType = pretendNativeHlsSupport();
    mocks.getRemoteVideo.mockResolvedValue(remoteVideo({ stream_url: HLS_MASTER }));
    render(<RemoteWatchView id="r1" />);

    await screen.findByRole("heading", { name: "Dawn over the fjord" });
    expect(screen.getByText("6:07")).toBeTruthy();
  });

  it("offers instance moderation only to a signed-in viewer", async () => {
    restoreCanPlayType = pretendNativeHlsSupport();
    mocks.getRemoteVideo.mockResolvedValue(remoteVideo({ stream_url: HLS_MASTER }));
    render(<RemoteWatchView id="r1" />);
    await screen.findByRole("heading", { name: "Dawn over the fjord" });
    expect(screen.queryByRole("button", { name: /Mute instance/ })).toBeNull();

    cleanup();
    mocks.useSession.mockReturnValue({ status: "authed" });
    render(<RemoteWatchView id="r1" />);
    await screen.findByRole("heading", { name: "Dawn over the fjord" });
    expect(screen.getByRole("button", { name: /Mute instance peer\.example/ })).toBeTruthy();
  });
});

describe("RemoteWatchView mirrored thread", () => {
  it("renders the comments the origin sent, with each author's own domain", async () => {
    restoreCanPlayType = pretendNativeHlsSupport();
    mocks.getRemoteVideo.mockResolvedValue(remoteVideo({ stream_url: HLS_MASTER }));
    mocks.getRemoteVideoComments.mockResolvedValue({
      comments: [
        {
          id: "c1",
          author_name: "ada",
          author_domain: "peer.example",
          actor_url: "https://peer.example/accounts/ada",
          object_url: "https://peer.example/notes/1",
          body: "Beautiful grade.",
          edited: false,
          created_at: "2026-09-05T10:00:00Z",
        },
        {
          id: "c2",
          author_name: "ada",
          author_domain: "other.example",
          actor_url: "https://other.example/accounts/ada",
          object_url: "https://other.example/notes/2",
          body: "Agreed.",
          edited: true,
          created_at: "2026-09-05T11:00:00Z",
        },
      ],
      total: 2,
      limit: 50,
      offset: 0,
    } satisfies RemoteVideoCommentListResponse);

    render(<RemoteWatchView id="r1" />);
    expect(await screen.findByText("Beautiful grade.")).toBeTruthy();
    expect(screen.getByText("Agreed.")).toBeTruthy();
    // Two authors called "ada" on different servers must be distinguishable.
    expect(screen.getAllByText("ada")).toHaveLength(2);
    // peer.example appears more than once (the card's own origin badge and the
    // "Watch on …" link), so the assertion is that BOTH domains are present in
    // the thread, not how many times each occurs on the page.
    expect(screen.getAllByText(/peer\.example/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/other\.example/).length).toBeGreaterThan(0);
    // An origin can rewrite a comment under a reader; the thread says so.
    expect(screen.getByText(/edited/)).toBeTruthy();
  });

  // A29 rehearsal 3. Migration 0140's parent_object_url made the mirror
  // THREADED in storage and in the contract; the page rendered every row flat,
  // so a reply and the comment it answers looked like two unrelated remarks —
  // and on a thread where the reply arrived first, in the wrong order. The
  // contract's own rule for a parent that is not among the rows we hold is "a
  // thread with a hole is better than a dropped reply": render it at the top.
  it("threads a reply under the comment it answers", async () => {
    restoreCanPlayType = pretendNativeHlsSupport();
    mocks.getRemoteVideo.mockResolvedValue(remoteVideo({ stream_url: HLS_MASTER }));
    mocks.getRemoteVideoComments.mockResolvedValue({
      comments: [
        {
          id: "c1",
          author_name: "ada",
          author_domain: "peer.example",
          actor_url: "https://peer.example/accounts/ada",
          object_url: "https://peer.example/notes/1",
          body: "Beautiful grade.",
          edited: false,
          created_at: "2026-09-05T10:00:00Z",
        },
        {
          id: "c3",
          author_name: "kai",
          author_domain: "peer.example",
          actor_url: "https://peer.example/accounts/kai",
          object_url: "https://peer.example/notes/3",
          parent_object_url: "https://peer.example/notes/2",
          body: "Orphan reply.",
          edited: false,
          created_at: "2026-09-05T12:00:00Z",
        },
        {
          id: "c2",
          author_name: "bo",
          author_domain: "peer.example",
          actor_url: "https://peer.example/accounts/bo",
          object_url: "https://peer.example/notes/9",
          parent_object_url: "https://peer.example/notes/1",
          body: "Thank you.",
          edited: false,
          created_at: "2026-09-05T11:00:00Z",
        },
      ],
      total: 3,
      limit: 50,
      offset: 0,
    } satisfies RemoteVideoCommentListResponse);

    render(<RemoteWatchView id="r1" />);
    const reply = await screen.findByText("Thank you.");
    const parent = screen.getByText("Beautiful grade.");
    const orphan = screen.getByText("Orphan reply.");

    const row = (el: HTMLElement) => el.closest("[data-thread-depth]");
    expect(row(parent)?.getAttribute("data-thread-depth")).toBe("0");
    expect(row(reply)?.getAttribute("data-thread-depth")).toBe("1");
    // A reply whose parent this instance was never sent is not dropped and not
    // hidden: it renders at the top level.
    expect(row(orphan)?.getAttribute("data-thread-depth")).toBe("0");

    // A reply must FOLLOW its parent, whatever order the origin's rows arrived
    // in — here the orphan was listed between them.
    const bodies = screen.getAllByText(/Beautiful grade\.|Thank you\.|Orphan reply\./);
    expect(bodies.map((el) => el.textContent)).toEqual([
      "Beautiful grade.",
      "Thank you.",
      "Orphan reply.",
    ]);
    // And it says whom it answers, because indentation alone is not an
    // accessible name.
    expect(screen.getByText(/Replying to ada/)).toBeTruthy();
  });

  it("explains an empty thread rather than implying the video has no comments", async () => {
    restoreCanPlayType = pretendNativeHlsSupport();
    mocks.getRemoteVideo.mockResolvedValue(remoteVideo({ stream_url: HLS_MASTER }));
    render(<RemoteWatchView id="r1" />);
    expect(await screen.findByText(/mirrors the comments its origin sends it/)).toBeTruthy();
  });

  it("offers no composer — replying lives on the origin", async () => {
    restoreCanPlayType = pretendNativeHlsSupport();
    mocks.getRemoteVideo.mockResolvedValue(remoteVideo({ stream_url: HLS_MASTER }));
    render(<RemoteWatchView id="r1" />);
    await screen.findByRole("heading", { name: "Comments from the origin" });
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText(/so does replying/)).toBeTruthy();
  });
});

// A29 parity: the block a viewer can reach from the page they are on, and the
// one that addresses the right actor.
//
// The rehearsal measured the failure this closes: the settings form's only
// affordance was a handle, and on an instance where an account and a channel
// share a name WebFinger resolved that handle to the Person while the videos
// are attributed to the Group — so the block a viewer could actually make hid
// nothing, and the identity that WOULD have worked appeared on no page. The
// fixture is the contract's own RemoteVideo, so if account_actor_url ever
// leaves core's schema this file stops compiling rather than passing against an
// invented shape.
//
// The A29 follow-ups added the other half: the control must NAME the actor it
// addresses. Rehearsal 3 walked this page in Chromium and read
// "Block films@peer.example" on a control that blocks the PERSON who owns
// films — right about the effect, wrong about the subject, on the one screen
// where the account-vs-channel distinction is the whole ruling.
describe("RemoteWatchView account block", () => {
  const identified = {
    actor_url: "https://peer.example/video-channels/films",
    account_actor_url: "https://peer.example/accounts/kaisa",
    channel_handle: "films@peer.example",
  };

  it("blocks the OWNING ACCOUNT, not the channel the video is attributed to", async () => {
    mocks.useSession.mockReturnValue({ status: "authed" });
    mocks.getRemoteVideo.mockResolvedValue(remoteVideo(identified));
    render(<RemoteWatchView id="r1" />);

    fireEvent.click(await screen.findByRole("button", { name: "Block account kaisa@peer.example" }));

    await waitFor(() => expect(mocks.blockRemoteActor).toHaveBeenCalledTimes(1));
    // The ACCOUNT: one block covering every channel that person owns, including
    // the ones they have not created yet.
    expect(mocks.blockRemoteActor).toHaveBeenCalledWith("https://peer.example/accounts/kaisa");
    await screen.findByRole("status");
    expect(screen.getByRole("button", { name: "Unblock account kaisa@peer.example" })).toBeTruthy();
  });

  // When the origin named no owner the block genuinely IS against the channel
  // actor, and the label says so — the name follows the URL being sent, so it
  // cannot claim an account the request does not name.
  it("falls back to the channel actor when the origin named no owner, and says so", async () => {
    mocks.useSession.mockReturnValue({ status: "authed" });
    mocks.getRemoteVideo.mockResolvedValue(
      remoteVideo({ actor_url: identified.actor_url, channel_handle: identified.channel_handle }),
    );
    render(<RemoteWatchView id="r1" />);

    fireEvent.click(await screen.findByRole("button", { name: "Block account films@peer.example" }));
    await waitFor(() => expect(mocks.blockRemoteActor).toHaveBeenCalledTimes(1));
    expect(mocks.blockRemoteActor).toHaveBeenCalledWith(identified.actor_url);
  });

  it("undoes with the SAME url it blocked", async () => {
    mocks.useSession.mockReturnValue({ status: "authed" });
    mocks.getRemoteVideo.mockResolvedValue(remoteVideo(identified));
    render(<RemoteWatchView id="r1" />);

    fireEvent.click(await screen.findByRole("button", { name: "Block account kaisa@peer.example" }));
    fireEvent.click(await screen.findByRole("button", { name: "Unblock account kaisa@peer.example" }));

    await waitFor(() => expect(mocks.unblockRemoteActor).toHaveBeenCalledTimes(1));
    // Verbatim: an unblock is matched against the stored URL, so a page that
    // sent anything else would leave a block the viewer cannot lift.
    expect(mocks.unblockRemoteActor).toHaveBeenCalledWith("https://peer.example/accounts/kaisa");
  });

  it("offers nothing to an anonymous viewer, and nothing when the row carries no actor", async () => {
    mocks.getRemoteVideo.mockResolvedValue(remoteVideo(identified));
    render(<RemoteWatchView id="r1" />);
    await screen.findByRole("heading", { name: "Dawn over the fjord" });
    expect(screen.queryByRole("button", { name: /^Block / })).toBeNull();

    cleanup();
    mocks.useSession.mockReturnValue({ status: "authed" });
    mocks.getRemoteVideo.mockResolvedValue(remoteVideo());
    render(<RemoteWatchView id="r1" />);
    await screen.findByRole("heading", { name: "Dawn over the fjord" });
    expect(screen.queryByRole("button", { name: /^Block / })).toBeNull();
  });
});
