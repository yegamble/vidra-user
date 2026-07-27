// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminVideo } from "@/lib/api";

const mocks = vi.hoisted(() => ({
  getAdminVideos: vi.fn(),
  getVideo: vi.fn(),
  onChange: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getAdminVideos: mocks.getAdminVideos,
    getVideo: mocks.getVideo,
  },
  videoThumbnailUrl: (id: string) => `http://api.test/api/v1/videos/${id}/thumbnail`,
}));

import { AdminVideoPicker } from "./AdminVideoPicker";

function adminVideo(id: string, title: string, channel = "Ada Makes"): AdminVideo {
  return {
    id,
    title,
    channel_display_name: channel,
    channel_handle: "ada",
    has_thumbnail: false,
  } as AdminVideo;
}

// A controlled harness mirroring the admin form: onChange updates the value prop,
// exactly as ConfigForm's draft does — so a selection survives the round trip
// (the picker's hydrate effect keys off value === selected.id).
function Harness() {
  const [value, setValue] = useState("");
  return (
    <AdminVideoPicker
      label="Featured video"
      value={value}
      disabled={false}
      onChange={(v) => {
        mocks.onChange(v);
        setValue(v);
      }}
    />
  );
}

beforeEach(() => {
  mocks.getAdminVideos.mockReset();
  mocks.getVideo.mockReset();
  mocks.onChange.mockReset();
  mocks.getAdminVideos.mockResolvedValue({
    videos: [adminVideo("v1", "Doc One"), adminVideo("v2", "Doc Two")],
    limit: 8,
    offset: 0,
  });
});

afterEach(cleanup);

describe("AdminVideoPicker", () => {
  it("searches, selects a result, and then clears the pick", async () => {
    render(<Harness />);

    const input = screen.getByRole("combobox", { name: "Featured video" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "doc" } });

    // Debounced search hit the admin video endpoint with the query + limit.
    await waitFor(() =>
      expect(mocks.getAdminVideos).toHaveBeenCalledWith(
        expect.objectContaining({ q: "doc", limit: 8 }),
        expect.anything(),
      ),
    );

    // Both results render as options; select the first.
    const option = await screen.findByText("Doc One");
    fireEvent.click(option);

    // The selection stored the UUID and swapped in the preview card.
    expect(mocks.onChange).toHaveBeenCalledWith("v1");
    const preview = await screen.findByTestId("featured-video-preview");
    expect(preview.textContent).toContain("Doc One");
    // The search box is gone while a pick is shown.
    expect(screen.queryByRole("combobox")).toBeNull();
    // A stored pick renders from the selection itself — no detail refetch needed.
    expect(mocks.getVideo).not.toHaveBeenCalled();

    // Clear returns to the search box and reports the empty value upstream.
    fireEvent.click(screen.getByRole("button", { name: "Clear Featured video" }));
    expect(mocks.onChange).toHaveBeenLastCalledWith("");
    await waitFor(() => expect(screen.getByRole("combobox")).toBeTruthy());
    expect(screen.queryByTestId("featured-video-preview")).toBeNull();
  });

  it("hydrates a preview from a pre-existing stored UUID via the detail endpoint", async () => {
    mocks.getVideo.mockResolvedValue({
      id: "seed-1",
      title: "Seeded Pick",
      channel_display_name: "Seed Channel",
      has_thumbnail: false,
    });

    render(
      <AdminVideoPicker label="Featured video" value="seed-1" disabled={false} onChange={mocks.onChange} />,
    );

    // With a value already set, the picker resolves the title for its preview.
    const preview = await screen.findByTestId("featured-video-preview");
    expect(preview.textContent).toContain("Seeded Pick");
    expect(mocks.getVideo).toHaveBeenCalledWith("seed-1");
  });

  it("still shows a clearable card when a stored pick cannot be resolved", async () => {
    mocks.getVideo.mockRejectedValue(new Error("not found"));

    render(
      <AdminVideoPicker label="Featured video" value="gone-1" disabled={false} onChange={mocks.onChange} />,
    );

    const preview = await screen.findByTestId("featured-video-preview");
    expect(preview.textContent).toContain("Selected video");
    expect(screen.getByRole("button", { name: "Clear Featured video" })).toBeTruthy();
  });
});
