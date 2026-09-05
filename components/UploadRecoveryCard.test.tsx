// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { UploadRecoveryCard } from "./UploadRecoveryCard";
vi.mock("@/lib/api", async original => ({ ...await original<typeof import("@/lib/api")>(), api: { listMyUploads: vi.fn(), cancelUploadSession: vi.fn(), deleteVideo: vi.fn() } }));
const list = vi.mocked(api.listMyUploads), cancel = vi.mocked(api.cancelUploadSession), remove = vi.mocked(api.deleteVideo);
const upload = { upload_id: "session", video_id: "draft", filename: "clip.mp4", size: 100, chunk_size: 50, total_chunks: 2, received_chunks: 1, expires_at: "2099-01-01T00:00:00Z", file_fingerprint: "" };
beforeEach(() => { list.mockResolvedValue({ uploads: [upload] }); cancel.mockResolvedValue(undefined); remove.mockResolvedValue(undefined); });
afterEach(() => { cleanup(); vi.resetAllMocks(); });
describe("upload recovery failures", () => {
  it("shows a failed inventory check and retries the authoritative list", async () => {
    list.mockRejectedValueOnce(new Error("offline"));
    render(<UploadRecoveryCard />);
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("Could not check unfinished uploads"));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Resume clip.mp4" })).toBeTruthy();
    expect(list).toHaveBeenCalledTimes(2);
  });
  it("does not hide the row or delete its draft if session cancellation fails", async () => {
    cancel.mockRejectedValueOnce(new Error("offline"));
    render(<UploadRecoveryCard />);
    fireEvent.click(await screen.findByRole("button", { name: "Discard clip.mp4" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Could not discard this upload. Please try again.");
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Discard clip.mp4" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Unfinished uploads" })).toBeNull());
    expect(cancel).toHaveBeenCalledTimes(2);expect(remove).toHaveBeenCalledWith("draft");
  });
  it("retains a failed draft cleanup for retry without repeating cancellation or offering resume", async () => {
    remove.mockRejectedValueOnce(new Error("offline"));
    render(<UploadRecoveryCard />);
    fireEvent.click(await screen.findByRole("button", { name: "Discard clip.mp4" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Upload cancelled, but its draft could not be deleted. Retry Discard to finish cleanup.");
    expect((screen.getByRole("button", { name: "Resume clip.mp4" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Discard clip.mp4" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Unfinished uploads" })).toBeNull());
    expect(cancel).toHaveBeenCalledTimes(1);expect(remove).toHaveBeenCalledTimes(2);
  });
});
