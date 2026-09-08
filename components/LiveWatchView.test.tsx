// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const mocks = vi.hoisted(() => ({ getLiveStream: vi.fn() }));

vi.mock("@/lib/api", () => ({
  api: { getLiveStream: mocks.getLiveStream },
  ApiError: class MockApiError extends Error {
    status: number;
    constructor(status = 500) {
      super("mock api error");
      this.status = status;
    }
  },
}));

// The player engine touches media APIs jsdom does not have; this file asserts
// which requests go out, and when.
vi.mock("@/lib/use-playback-engine", () => ({
  useLivePlayback: () => ({ videoRef: { current: null }, levels: [], level: -1, setLevel: () => {} }),
}));

// The session in context. null is the shipped default for this file: the view
// is rendered bare here, with no AuthProvider above it.
// `role` is part of the shape this view reads: staff get the termination
// control. Narrowing the fixture to { id } would make it impossible to write the
// test that a moderator sees the button and an ordinary viewer does not.
let optionalSession: { status: string; user: { id: string; role?: string } | null } | null = null;
vi.mock("@/components/auth/AuthProvider", () => ({
  useOptionalSession: () => optionalSession,
}));

import { LiveWatchView } from "./LiveWatchView";

beforeEach(() => {
  optionalSession = null;
  mocks.getLiveStream.mockReset();
  mocks.getLiveStream.mockResolvedValue({
    id: "s1",
    title: "A stream",
    state: "ended",
    privacy: "private",
    channel_handle: "film-house",
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  optionalSession = null;
});

// GET /live/{id} is per viewer for a PRIVATE stream: core 404s it for anyone
// but the owner (and the channel's content managers). A read that goes out
// before the refresh cookie has been redeemed is anonymous, so an owner
// hard-loading their own private stream landed on "not found" — and the effect
// never re-ran, so the page stayed wrong until a manual reload.
describe("LiveWatchView session settling", () => {
  it("does not read the stream while the session is still restoring", async () => {
    optionalSession = { status: "restoring", user: null };
    render(<LiveWatchView id="s1" />);
    await act(async () => {});
    expect(mocks.getLiveStream).not.toHaveBeenCalled();
  });

  it("reads it exactly once when the session settles", async () => {
    optionalSession = { status: "restoring", user: null };
    const { rerender } = render(<LiveWatchView id="s1" />);
    optionalSession = { status: "authed", user: { id: "u-1" } };
    rerender(<LiveWatchView id="s1" />);
    expect(await screen.findByText("A stream")).toBeTruthy();
    expect(mocks.getLiveStream).toHaveBeenCalledTimes(1);
  });

  it("reads it once for an anonymous visitor too", async () => {
    optionalSession = { status: "anon", user: null };
    render(<LiveWatchView id="s1" />);
    expect(await screen.findByText("A stream")).toBeTruthy();
    expect(mocks.getLiveStream).toHaveBeenCalledTimes(1);
  });
});

// The termination surface: a stream that a PERSON ended says so, and says why —
// to the people core actually sends the block to. Before this, a moderator
// termination was indistinguishable from a publisher dropping off, and the only
// person the action was aimed at was told nothing at all.
describe("LiveWatchView termination", () => {
  it("names the reason and the moderator's own words", async () => {
    optionalSession = { status: "authed", user: { id: "u-1" } };
    mocks.getLiveStream.mockResolvedValue({
      id: "s1",
      title: "A stream",
      state: "ended",
      privacy: "public",
      channel_handle: "film-house",
      termination: {
        terminated_at: "2026-09-08T12:00:00Z",
        by_moderator: true,
        reason_code: "copyright",
        reason: "studio claim 4471",
      },
    });
    render(<LiveWatchView id="s1" />);
    const msg = await screen.findByText(/ended by a moderator/i);
    expect(msg.textContent).toContain("Copyright claim");
    expect(msg.textContent).toContain("studio claim 4471");
  });

  it("does not accuse a creator who ended their own stream", async () => {
    optionalSession = { status: "authed", user: { id: "u-1" } };
    mocks.getLiveStream.mockResolvedValue({
      id: "s1",
      title: "A stream",
      state: "ended",
      privacy: "public",
      channel_handle: "film-house",
      termination: { terminated_at: "2026-09-08T12:00:00Z", by_moderator: false },
    });
    render(<LiveWatchView id="s1" />);
    expect(await screen.findByText(/You ended this stream/i)).toBeTruthy();
    expect(screen.queryByText(/moderator/i)).toBeNull();
  });

  // A PERMANENT stream returns to `offline` rather than `ended` when it is
  // terminated, because it is reusable. If the ended-state branch keyed on the
  // state alone, the reason would be invisible for exactly the streams a
  // moderator is most likely to end twice.
  it("shows the reason for a terminated PERMANENT stream, which is offline, not ended", async () => {
    optionalSession = { status: "authed", user: { id: "u-1" } };
    mocks.getLiveStream.mockResolvedValue({
      id: "s1",
      title: "A stream",
      state: "offline",
      privacy: "public",
      permanent: true,
      channel_handle: "film-house",
      termination: {
        terminated_at: "2026-09-08T12:00:00Z",
        by_moderator: true,
        reason_code: "spam",
      },
    });
    render(<LiveWatchView id="s1" />);
    expect(await screen.findByText(/ended by a moderator/i)).toBeTruthy();
  });

  it("says nothing when the publisher simply disconnected", async () => {
    optionalSession = { status: "anon", user: null };
    render(<LiveWatchView id="s1" />); // the default fixture: ended, no termination
    expect(await screen.findByText(/This live stream has ended/i)).toBeTruthy();
    expect(screen.queryByText(/moderator/i)).toBeNull();
  });
});

// "Absent, not zero." Core OMITS viewer_count on an instance that cannot measure
// it, so a rendered 0 would be this component inventing a fact — and the fact it
// would invent is "nobody is watching", told to a creator mid-broadcast.
describe("LiveWatchView viewer count", () => {
  const liveStream = (extra: Record<string, unknown>) => ({
    id: "s1",
    title: "A stream",
    state: "live",
    privacy: "public",
    channel_handle: "film-house",
    hls_url: "/api/v1/live/s1/hls/master.m3u8",
    ...extra,
  });

  it("renders the count when core sent one", async () => {
    optionalSession = { status: "anon", user: null };
    mocks.getLiveStream.mockResolvedValue(liveStream({ viewer_count: 1234 }));
    render(<LiveWatchView id="s1" />);
    expect(await screen.findByText("1,234 viewers")).toBeTruthy();
  });

  it("says viewer, singular, for one", async () => {
    optionalSession = { status: "anon", user: null };
    mocks.getLiveStream.mockResolvedValue(liveStream({ viewer_count: 1 }));
    render(<LiveWatchView id="s1" />);
    expect(await screen.findByText("1 viewer")).toBeTruthy();
  });

  it("renders a real zero — 'nobody is watching' is a fact core measured", async () => {
    optionalSession = { status: "anon", user: null };
    mocks.getLiveStream.mockResolvedValue(liveStream({ viewer_count: 0 }));
    render(<LiveWatchView id="s1" />);
    expect(await screen.findByText("0 viewers")).toBeTruthy();
  });

  it("renders NOTHING when the field is absent", async () => {
    optionalSession = { status: "anon", user: null };
    mocks.getLiveStream.mockResolvedValue(liveStream({}));
    render(<LiveWatchView id="s1" />);
    expect(await screen.findByText("A stream")).toBeTruthy();
    expect(screen.queryByText(/viewers?$/)).toBeNull();
  });
});

// The moderator control. A moderation power an actual moderator cannot invoke is
// not a moderation power, and an End-stream button an ordinary viewer can see is
// a button that only ever produces a 403.
describe("LiveWatchView moderator termination control", () => {
  const liveStream = {
    id: "s1",
    title: "A stream",
    state: "live",
    privacy: "public",
    channel_handle: "film-house",
    hls_url: "/api/v1/live/s1/hls/master.m3u8",
  };

  it("is offered to a moderator on a live stream", async () => {
    optionalSession = { status: "authed", user: { id: "u-1", role: "moderator" } };
    mocks.getLiveStream.mockResolvedValue(liveStream);
    render(<LiveWatchView id="s1" />);
    expect(await screen.findByRole("button", { name: "End stream" })).toBeTruthy();
  });

  it("is not offered to an ordinary viewer", async () => {
    optionalSession = { status: "authed", user: { id: "u-1", role: "user" } };
    mocks.getLiveStream.mockResolvedValue(liveStream);
    render(<LiveWatchView id="s1" />);
    expect(await screen.findByText("A stream")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "End stream" })).toBeNull();
  });

  it("is not offered on a stream that is not live", async () => {
    optionalSession = { status: "authed", user: { id: "u-1", role: "admin" } };
    render(<LiveWatchView id="s1" />); // the default fixture is ended
    expect(await screen.findByText("A stream")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "End stream" })).toBeNull();
  });
});
