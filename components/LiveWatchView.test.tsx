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
let optionalSession: { status: string; user: { id: string } | null } | null = null;
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
