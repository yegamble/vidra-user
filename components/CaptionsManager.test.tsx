// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class FakeApiError extends Error {
    status: number;
    constructor(status: number) {
      super(`http ${status}`);
      this.status = status;
    }
  }
  return {
    FakeApiError,
    getCaptions: vi.fn(),
    getVideoConfig: vi.fn(),
    uploadCaption: vi.fn(),
    deleteCaption: vi.fn(),
    requestAutoCaption: vi.fn(),
    getAutoCaption: vi.fn(),
    getInstanceCached: vi.fn(),
  };
});

vi.mock("@/lib/api", () => ({
  ApiError: mocks.FakeApiError,
  api: {
    getCaptions: mocks.getCaptions,
    getVideoConfig: mocks.getVideoConfig,
    uploadCaption: mocks.uploadCaption,
    deleteCaption: mocks.deleteCaption,
    requestAutoCaption: mocks.requestAutoCaption,
    getAutoCaption: mocks.getAutoCaption,
  },
  errorMessage: (_error: unknown, fallback: string) => fallback,
  getInstanceCached: mocks.getInstanceCached,
}));

import { CaptionsManager } from "@/components/CaptionsManager";

const UNAVAILABLE = "Automatic captions aren't available on this server.";

beforeEach(() => {
  mocks.getCaptions.mockResolvedValue({ captions: [] });
  mocks.getVideoConfig.mockResolvedValue({ categories: [], languages: [], licenses: [] });
  mocks.getInstanceCached.mockResolvedValue({
    name: "Vidra",
    features: { transcription: true },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Feature flag (config-parity W8/W15): /instance features.transcription is the
// proactive signal that Whisper auto-captioning is unavailable; only an
// EXPLICIT false disables the control up front.
describe("CaptionsManager transcription feature flag", () => {
  it("shows the auto-caption control when transcription is on", async () => {
    render(<CaptionsManager videoId="video-1" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Generate automatically" })).toBeDefined(),
    );
    expect(screen.queryByText(UNAVAILABLE)).toBeNull();
  });

  it("shows the unavailable explanation instead of the control when transcription is off", async () => {
    mocks.getInstanceCached.mockResolvedValue({
      name: "Vidra",
      features: { transcription: false },
    });
    render(<CaptionsManager videoId="video-1" />);
    await waitFor(() => expect(screen.getByText(UNAVAILABLE)).toBeDefined());
    expect(screen.queryByRole("button", { name: "Generate automatically" })).toBeNull();
    // Manual caption upload stays available — only the Whisper affordance hides.
    expect(screen.getByRole("button", { name: "Upload" })).toBeDefined();
  });

  it("keeps the control when the flag is absent (older backend)", async () => {
    mocks.getInstanceCached.mockResolvedValue({ name: "Vidra", features: {} });
    render(<CaptionsManager videoId="video-1" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Generate automatically" })).toBeDefined(),
    );
    expect(screen.queryByText(UNAVAILABLE)).toBeNull();
  });

  it("keeps the control when the instance read fails", async () => {
    mocks.getInstanceCached.mockRejectedValue(new Error("network down"));
    render(<CaptionsManager videoId="video-1" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Generate automatically" })).toBeDefined(),
    );
    expect(screen.queryByText(UNAVAILABLE)).toBeNull();
  });
});
