// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  api: {},
  errorMessage: (_error: unknown, fallback: string) => fallback,
  isSensitiveVideo: () => false,
  isUploadCancelled: () => false,
  resumableUpload: vi.fn(),
  videoThumbnailUrl: () => "",
}));

import { VideoRow } from "@/components/studio/VideoRow";
import type { Video } from "@/lib/api";

afterEach(cleanup);

function row(overrides: Partial<Video> = {}): Video {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Owner Clip",
    description: "",
    privacy: "public",
    state: "published",
    created_at: new Date().toISOString(),
    is_sensitive: false,
    sensitive_reason: "",
    remote: false,
    ...overrides,
  } as Video;
}

function renderRow(video: Video) {
  render(
    <VideoRow video={video} config={null} onUpdated={() => {}} onDeleted={() => {}} />,
  );
}

// A16 slice 2 measured the sharpest gap in the moderation surface: a blocked
// video 404s for its OWNER as well as everyone else, leaves every public
// listing, and sends no notification — while this row, the creator's own
// management view, kept reading "published" with nothing to say otherwise. The
// contract now carries `blocked` on the owner listing; this is the row honouring
// it.
describe("VideoRow — moderation state", () => {
  it("renders a published video with no moderation notice", () => {
    renderRow(row());
    expect(screen.getByText("published")).toBeTruthy();
    expect(screen.queryByText(/blocked/i)).toBeNull();
  });

  it("marks a blocked video and says what it means for viewers", () => {
    renderRow(row({ blocked: true }));
    expect(screen.getByText("blocked")).toBeTruthy();
    expect(screen.getByText(/not available to viewers/i)).toBeTruthy();
    // The state is unchanged by a block, and the row must keep saying so
    // rather than inventing a state the server never sent.
    expect(screen.getByText("published")).toBeTruthy();
  });

  it("does not show the creator the moderator's reason", () => {
    // The contract never sends one to this surface; the row must not invent a
    // placeholder that implies one exists, and reason-visibility stays an open
    // product ruling rather than something the frontend settles by accident.
    renderRow(row({ blocked: true }));
    expect(screen.queryByText(/reason/i)).toBeNull();
  });
});
