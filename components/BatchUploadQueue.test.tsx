// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, resumableUpload } from "@/lib/api";
import type { UploadStatusResponse, Video } from "@/lib/api";
import { BatchUploadQueue } from "./BatchUploadQueue";

vi.mock("@/lib/api", async original => ({
  ...await original<typeof import("@/lib/api")>(),
  api: { getMyQuota: vi.fn(), createVideoDraft: vi.fn(), getUploadSession: vi.fn(), cancelUploadSession: vi.fn(), deleteVideo: vi.fn() },
  resumableUpload: vi.fn(),
}));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe("batch retry identity", () => {
  it("reuses the interrupted draft/session while leaving successful rows alone", async () => {
    vi.mocked(api.getMyQuota).mockRejectedValue(new Error("unavailable"));
    vi.mocked(api.createVideoDraft).mockImplementation(async (_handle, body) => ({ id: body.title, state: "draft" }) as Video);
    const status = { upload_id: "interrupted", video_id: "retry", state: "active", received_chunks: [0] } as UploadStatusResponse;
    vi.mocked(api.getUploadSession).mockResolvedValue(status);
    let interrupted = false;
    vi.mocked(resumableUpload).mockImplementation(async (id, _file, options) => {
      if (id === "retry" && !interrupted) {
        interrupted = true;
        options?.onSessionOpened?.("interrupted");
        throw new Error("network interrupted");
      }
      return { video: { id, state: "published" } as Video };
    });
    render(<BatchUploadQueue initialFiles={[new File(["one"], "good.mp4"), new File(["two"], "retry.mp4")]} channels={[]} defaultHandle="creator" defaultPrivacy="private" onClearBatch={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Upload 2 videos" }));
    fireEvent.click(await screen.findByRole("button", { name: "Retry retry.mp4" }));
    await waitFor(() => expect(screen.getAllByRole("link", { name: "View video" })).toHaveLength(2));
    expect(api.createVideoDraft).toHaveBeenCalledTimes(2);
    expect(api.getUploadSession).toHaveBeenCalledWith("interrupted", expect.any(AbortSignal));
    expect(resumableUpload).toHaveBeenLastCalledWith("retry", expect.any(File), expect.objectContaining({ resume: status }));
    expect(vi.mocked(resumableUpload).mock.calls.filter(([id]) => id === "good")).toHaveLength(1);
  });
  it("reports cancellation cleanup failure instead of a false cancelled state", async () => {
    vi.mocked(api.getMyQuota).mockRejectedValue(new Error("unavailable"));
    vi.mocked(api.createVideoDraft).mockResolvedValue({ id: "draft" } as Video);
    vi.mocked(api.cancelUploadSession).mockRejectedValue(new ApiError({ status: 503, code: "unavailable", message: "cleanup unavailable" }));
    vi.mocked(resumableUpload).mockImplementation(async (_id, _file, options) => {
      options?.onSessionOpened?.("session");
      throw new ApiError({ status: 0, code: "upload_cancelled", message: "cancelled" });
    });
    render(<BatchUploadQueue initialFiles={[new File(["one"], "cancel.mp4")]} channels={[]} defaultHandle="creator" defaultPrivacy="private" onClearBatch={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Upload 1 video" }));
    expect(await screen.findByText("Upload failed. Please try again.")).toBeTruthy();
    expect(screen.getByText("Failed", { exact: true })).toBeTruthy();
    expect(screen.queryByText("Cancelled", { exact: true })).toBeNull();
    expect(api.deleteVideo).not.toHaveBeenCalled();
  });
  it("retries after the capacity backoff expires without creating another draft", async () => {
    vi.mocked(api.getMyQuota).mockRejectedValue(new Error("unavailable"));
    vi.mocked(api.createVideoDraft).mockResolvedValue({ id: "draft" } as Video);
    vi.mocked(resumableUpload)
      .mockRejectedValueOnce(new ApiError({ status: 429, code: "too_many_active_uploads", message: "capacity" }))
      .mockResolvedValue({ video: { id: "draft", state: "published" } as Video });
    render(<BatchUploadQueue initialFiles={[new File(["one"], "capacity.mp4")]} channels={[]} defaultHandle="creator" defaultPrivacy="private" onClearBatch={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Upload 1 video" }));
    await waitFor(() => expect(screen.getByRole("link", { name: "View video" })).toBeTruthy(), { timeout: 4500 });
    expect(api.createVideoDraft).toHaveBeenCalledTimes(1);
  });

});
