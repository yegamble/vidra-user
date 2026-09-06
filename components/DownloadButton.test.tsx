// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getVideoDownloads: vi.fn(),
  fetchVideoDownload: vi.fn(),
  createObjectURL: vi.fn(() => "blob:download-test"),
  revokeObjectURL: vi.fn(),
  anchorClick: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getVideoDownloads: mocks.getVideoDownloads,
    fetchVideoDownload: mocks.fetchVideoDownload,
  },
  errorMessage: (_error: unknown, fallback: string) => fallback,
}));

// The session in context. null is the shipped default for this file: the
// dialog is rendered bare here, with no AuthProvider above it, which is
// exactly what useOptionalSession answers null for.
let optionalSession: { status: string; user: { id: string } | null } | null = null;
vi.mock("@/components/auth/AuthProvider", () => ({
  useOptionalSession: () => optionalSession,
}));

import { DownloadDialog } from "@/components/DownloadButton";
import type { VideoDownloadFile } from "@/lib/api";

const files: VideoDownloadFile[] = [
  {
    kind: "original",
    url: "/api/v1/videos/video-1/download/original",
    filename: "source.mov",
    content_type: "video/quicktime",
    size_bytes: 900_000_000,
    original_name: "camera-source.mov",
    width: 3840,
    height: 2160,
  },
  {
    kind: "webm",
    url: "/api/v1/videos/video-1/download/webm",
    filename: "video.webm",
    content_type: "video/webm",
    size_bytes: 80_000_000,
    width: 1920,
    height: 1080,
  },
  {
    kind: "hls",
    url: "/api/v1/videos/video-1/download/hls/720",
    video_only_url: "/api/v1/videos/video-1/download/hls/720?audio=false",
    filename: "video-720p.mp4",
    content_type: "video/mp4",
    size_bytes: 28_000_000,
    width: 1280,
    height: 720,
  },
  {
    kind: "hls",
    url: "/api/v1/videos/video-1/download/hls/2160",
    video_only_url: "/api/v1/videos/video-1/download/hls/2160?audio=false",
    filename: "video-2160p.mp4",
    content_type: "video/mp4",
    size_bytes: 283_200_000,
    width: 3840,
    height: 2160,
  },
  {
    kind: "audio",
    url: "/api/v1/videos/video-1/download/audio",
    filename: "audio.m4a",
    content_type: "audio/mp4",
    size_bytes: 4_700_000,
  },
  {
    kind: "subtitle",
    url: "/api/v1/videos/video-1/download/subtitles/en",
    filename: "subtitles-en.vtt",
    content_type: "text/vtt",
    size_bytes: 1_200,
    language: "en",
    label: "English",
  },
];

function renderDialog(playbackToken: string | null = "playback-secret") {
  return render(
    <DownloadDialog videoId="video-1" playbackToken={playbackToken} onClose={vi.fn()} />,
  );
}

beforeEach(() => {
  mocks.getVideoDownloads.mockResolvedValue({ files });
  mocks.fetchVideoDownload.mockResolvedValue(new Blob(["download"]));
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: mocks.createObjectURL,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: mocks.revokeObjectURL,
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(mocks.anchorClick);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("DownloadDialog", () => {
  it("groups formats and sorts transcoded video choices by kind and quality", async () => {
    renderDialog();

    await screen.findByRole("radio", { name: /2160p/ });
    expect(mocks.getVideoDownloads).toHaveBeenCalledWith(
      "video-1",
      "playback-secret",
      expect.any(AbortSignal),
    );
    const labels = screen.getAllByRole("radio").map((radio) => radio.parentElement?.textContent ?? "");
    expect(labels[0]).toContain("2160p");
    expect(labels[1]).toContain("720p");
    expect(labels[2]).toContain("1080p WebM");
    expect(labels[3]).toContain("Original file");
    expect((screen.getByRole("radio", { name: /2160p/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("option", { name: "Audio only" }) as HTMLOptionElement).disabled).toBe(false);
    expect((screen.getByRole("option", { name: "Subtitles" }) as HTMLOptionElement).disabled).toBe(false);
  });

  it("downloads HLS with audio by default and uses the video-only URL when unchecked", async () => {
    renderDialog();
    const includeAudio = await screen.findByRole("checkbox", {
      name: "Include audio in the same file",
    });
    expect((includeAudio as HTMLInputElement).checked).toBe(true);

    const download = screen.getByRole("button", { name: "Download" });
    fireEvent.click(download);
    await waitFor(() =>
      expect(mocks.fetchVideoDownload).toHaveBeenCalledWith(
        "video-1",
        "/api/v1/videos/video-1/download/hls/2160",
        "playback-secret",
      ),
    );
    expect(mocks.createObjectURL).toHaveBeenCalled();
    expect(mocks.anchorClick).toHaveBeenCalledTimes(1);

    await waitFor(() => expect((download as HTMLButtonElement).disabled).toBe(false));
    mocks.fetchVideoDownload.mockClear();
    fireEvent.click(includeAudio);
    expect((includeAudio as HTMLInputElement).checked).toBe(false);
    fireEvent.click(download);
    await waitFor(() =>
      expect(mocks.fetchVideoDownload).toHaveBeenCalledWith(
        "video-1",
        "/api/v1/videos/video-1/download/hls/2160?audio=false",
        "playback-secret",
      ),
    );
  });

  it("selects and downloads the audio and subtitle groups with the playback token", async () => {
    renderDialog("gate-token");
    const format = await screen.findByRole("combobox", { name: "Download format" });
    const download = screen.getByRole("button", { name: "Download" });

    fireEvent.change(format, { target: { value: "audio" } });
    expect(screen.getByRole("radio", { name: /Audio only/ })).toBeTruthy();
    fireEvent.click(download);
    await waitFor(() =>
      expect(mocks.fetchVideoDownload).toHaveBeenCalledWith(
        "video-1",
        "/api/v1/videos/video-1/download/audio",
        "gate-token",
      ),
    );

    await waitFor(() => expect((download as HTMLButtonElement).disabled).toBe(false));
    mocks.fetchVideoDownload.mockClear();
    fireEvent.change(format, { target: { value: "subtitles" } });
    expect(screen.getByRole("radio", { name: /English/ })).toBeTruthy();
    fireEvent.click(download);
    await waitFor(() =>
      expect(mocks.fetchVideoDownload).toHaveBeenCalledWith(
        "video-1",
        "/api/v1/videos/video-1/download/subtitles/en",
        "gate-token",
      ),
    );
  });

  it("shows an error and disables downloading when format discovery fails", async () => {
    mocks.getVideoDownloads.mockRejectedValueOnce(new Error("metadata unavailable"));
    renderDialog();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not load the available downloads.");
    expect((screen.getByRole("button", { name: "Download" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("keeps the dialog open and reports an attachment download failure", async () => {
    mocks.fetchVideoDownload.mockRejectedValueOnce(new Error("attachment unavailable"));
    renderDialog();
    await screen.findByRole("radio", { name: /2160p/ });

    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not download this file.");
    expect(screen.getByRole("dialog", { name: "Download" })).toBeTruthy();
  });
});

// What GET /videos/{id}/download offers is PER VIEWER: videoForDownload resolves
// the file set for the caller, so an owner (and a video whose download policy
// is not "everyone") sees a different list from an anonymous visitor. The
// dialog opens over a server-rendered watch page, so it could mount before the
// refresh cookie had been redeemed and take the anonymous answer for good.
describe("DownloadDialog session settling", () => {
  beforeEach(() => {
    optionalSession = null;
  });

  afterEach(() => {
    optionalSession = null;
  });

  it("does not ask for the file list while the session is still restoring", async () => {
    optionalSession = { status: "restoring", user: null };
    mocks.getVideoDownloads.mockResolvedValue({ files });
    render(<DownloadDialog videoId="video-1" onClose={() => {}} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(mocks.getVideoDownloads).not.toHaveBeenCalled();
  });

  it("asks exactly once when the session settles", async () => {
    optionalSession = { status: "restoring", user: null };
    mocks.getVideoDownloads.mockResolvedValue({ files });
    const { rerender } = render(
      <DownloadDialog videoId="video-1" onClose={() => {}} />,
    );
    optionalSession = { status: "authed", user: { id: "u-1" } };
    rerender(<DownloadDialog videoId="video-1" onClose={() => {}} />);
    await waitFor(() => expect(mocks.getVideoDownloads).toHaveBeenCalledTimes(1));
  });
});
