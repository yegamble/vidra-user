// @vitest-environment jsdom
//
// The embed refuses an internal (members-only) video to an anonymous viewer the
// way it refuses a private one — "not available" — rather than offering a
// sign-in prompt inside somebody else's page, as PeerTube does.
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getVideoEmbedPrivacy: vi.fn(),
  getVideo: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/player/VideoPlayer", () => ({ VideoPlayer: () => <div data-testid="player" /> }));
vi.mock("@/components/watch/PasswordUnlockPanel", () => ({
  PasswordUnlockPanel: () => <div data-testid="unlock" />,
}));
vi.mock("@/lib/api/playback-token-store", () => ({ clearPlaybackToken: () => {}, setPlaybackToken: () => {} }));
vi.mock("@/lib/embed-player-api", () => ({ startEmbedApi: () => () => {} }));
vi.mock("@/lib/api", () => ({
  api: mocks,
  ApiError: class MockApiError extends Error {
    constructor(
      public status: number,
      public code: string,
    ) {
      super(code);
    }
  },
}));

import { ApiError } from "@/lib/api";
import { EmbedPlayer } from "./EmbedPlayer";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function refusal(status: number, code: string): Error {
  return new (ApiError as unknown as new (s: number, c: string) => Error)(status, code);
}

describe("EmbedPlayer — internal video", () => {
  it("is 'not available' to an anonymous viewer, like a private video", async () => {
    // Both reads refuse: the embed-privacy read fails open, then the detail is
    // the sign-in refusal.
    mocks.getVideoEmbedPrivacy.mockRejectedValue(refusal(401, "sign_in_required"));
    mocks.getVideo.mockRejectedValue(refusal(401, "sign_in_required"));
    render(<EmbedPlayer id="v1" />);
    await act(async () => {});
    expect(screen.getByText("This video is not available.")).toBeTruthy();
    expect(screen.queryByText("Could not load this video.")).toBeNull();
    expect(screen.queryByTestId("player")).toBeNull();
  });

  it("still offers the unlock prompt for a password video", async () => {
    mocks.getVideoEmbedPrivacy.mockRejectedValue(refusal(500, "error"));
    mocks.getVideo.mockRejectedValue(refusal(401, "password_required"));
    render(<EmbedPlayer id="v1" />);
    await act(async () => {});
    expect(screen.getByTestId("unlock")).toBeTruthy();
  });
});
