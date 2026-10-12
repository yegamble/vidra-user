// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const updateVideo = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({
  api: { updateVideo },
  errorMessage: (_error: unknown, fallback: string) => fallback,
  isSensitiveVideo: () => false,
  isUploadCancelled: () => false,
  resumableUpload: vi.fn(),
  videoThumbnailUrl: () => "",
}));

import { VideoRow } from "@/components/studio/VideoRow";
import type { Channel, Video } from "@/lib/api";

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

  it("shows the creator the moderator's reason", () => {
    // The A16 ruling settled what slice 2 left open. The reason was already
    // written — the moderator types it for the block-list — and a creator told
    // only that something was taken down can neither appeal it nor avoid
    // repeating it, so it is shown here, on the one surface that is theirs.
    renderRow(row({ blocked: true, block_reason: "Third-party music" }));
    expect(screen.getByText(/reason/i)).toBeTruthy();
    expect(screen.getByText(/Third-party music/)).toBeTruthy();
  });

  it("says nothing about a reason when the moderator wrote none", () => {
    // The contract omits block_reason when it is empty — and a lifted block
    // deletes it outright — so the row must not invent a placeholder that
    // implies one exists. The take-down sentence still stands on its own.
    renderRow(row({ blocked: true }));
    expect(screen.queryByText(/reason/i)).toBeNull();
    expect(screen.getByText(/not available to viewers/i)).toBeTruthy();
  });
});

// T20: a creator can move a video to another channel they manage. The select is
// only worth showing when there IS another channel to move to, and the request
// carries channel_id only when the choice actually changed (a plain title edit
// must not look like a move to the server).
describe("VideoRow — move to another channel", () => {
  const channel = (id: string, handle: string, owner = "owner-1"): Channel =>
    ({ id, handle, display_name: `Name ${handle}`, owner_id: owner }) as Channel;
  const A = channel("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "alpha");
  const B = channel("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "beta");
  // A channel the caller edits for SOMEONE ELSE: never a move target.
  const C = channel("cccccccc-cccc-4ccc-8ccc-cccccccccccc", "gamma", "owner-2");

  function renderEditing(channels: Channel[] | undefined, onUpdated = vi.fn()) {
    render(
      <VideoRow
        video={row({ channel_id: A.id })}
        config={null}
        channels={channels}
        initiallyEditing
        basicOnly
        onUpdated={onUpdated}
        onDeleted={() => {}}
      />,
    );
    return onUpdated;
  }

  it("hides the Channel select when the caller manages one channel or none are passed", () => {
    renderEditing([A]);
    expect(screen.queryByLabelText("Edit channel")).toBeNull();
    cleanup();
    renderEditing(undefined);
    expect(screen.queryByLabelText("Edit channel")).toBeNull();
  });

  it("offers only channels with the same owner, and hides the select when none remain", () => {
    renderEditing([A, B, C]);
    const opts = Array.from(
      (screen.getByLabelText("Edit channel") as HTMLSelectElement).options,
    ).map((o) => o.value);
    expect(opts).toEqual([A.id, B.id]);
    cleanup();
    renderEditing([A, C]);
    expect(screen.queryByLabelText("Edit channel")).toBeNull();
  });

  it("omits channel_id from an edit that did not change the channel", async () => {
    updateVideo.mockReset();
    updateVideo.mockResolvedValue(row({ channel_id: A.id }));
    renderEditing([A, B]);
    expect((screen.getByLabelText("Edit channel") as HTMLSelectElement).value).toBe(A.id);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(updateVideo).toHaveBeenCalledTimes(1));
    expect(updateVideo.mock.calls[0][1]).not.toHaveProperty("channel_id");
  });

  it("sends the chosen channel_id and reports the moved video", async () => {
    updateVideo.mockReset();
    updateVideo.mockResolvedValue(row({ channel_id: B.id }));
    const onUpdated = renderEditing([A, B]);
    fireEvent.change(screen.getByLabelText("Edit channel"), { target: { value: B.id } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(updateVideo).toHaveBeenCalledTimes(1));
    expect(updateVideo.mock.calls[0][1]).toMatchObject({ channel_id: B.id });
    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
  });
});
