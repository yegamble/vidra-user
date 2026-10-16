// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class ApiError extends Error {
    constructor(readonly status: number) { super(`HTTP ${status}`); }
  }
  return { ApiError, upload: vi.fn(), status: vi.fn() };
});
vi.mock("@/lib/api", () => ({
  ApiError: mocks.ApiError,
  authApi: { importPeerTubeArchive: mocks.upload, getPeerTubeFollowImport: mocks.status },
}));

import { PeerTubeImportCard } from "./PeerTubeImportCard";
import { I18nProvider } from "@/components/I18nProvider";
import { fr } from "@/lib/i18n/fr";

const summary = {
  channels_created: 1, channels_existing: 2, channels_skipped: 3, channels_mapped: [],
  playlists_created: 4, playlists_existing: 5, playlists_skipped: 6,
  playlist_items_added: 7, playlist_items_skipped: 8, settings_applied: 1,
  skipped_sections: { playlist_items_not_addable: 8 },
  follows_queued: 2, follows_skipped_federation: 0, follows_job_id: "job1",
};
const progress = { id: "job1", created_at: "2026-10-16T00:00:00Z", total: 2,
  pending: 1, done: 1, failed: 0, skipped_federation: 0, skipped_invalid: 0 };

async function upload(name = "peertube.zip") {
  fireEvent.change(screen.getByLabelText("PeerTube export (.zip)"), {
    target: { files: [new File(["PK"], name, { type: "application/zip" })] },
  });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Import PeerTube archive" })); });
}

beforeEach(() => { vi.clearAllMocks(); mocks.upload.mockResolvedValue(summary); mocks.status.mockResolvedValue(progress); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("PeerTube archive import", () => {
  it("uploads the original zip and displays the import counts and skip reasons", async () => {
    mocks.upload.mockResolvedValue({ ...summary, follows_job_id: null });
    render(<PeerTubeImportCard />);
    await upload();
    expect(mocks.upload.mock.calls[0][0]).toBeInstanceOf(File);
    expect(mocks.upload.mock.calls[0][0].name).toBe("peertube.zip");
    expect(screen.getByText("Channels: 1 created, 2 already present, 3 skipped.")).toBeTruthy();
    expect(screen.getByText("Playlists: 4 created, 5 already present, 6 skipped.")).toBeTruthy();
    expect(screen.getByText(/Videos unavailable for playlists: 8/)).toBeTruthy();
    expect(mocks.status).not.toHaveBeenCalled();
  });

  it("rejects other file types without sending them", async () => {
    render(<PeerTubeImportCard />);
    await upload("account.json");
    expect(screen.getByRole("alert").textContent).toContain("Choose a PeerTube export .zip archive.");
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("polls follow progress to completion and stops", async () => {
    vi.useFakeTimers();
    mocks.status.mockResolvedValueOnce(progress).mockResolvedValueOnce({ ...progress, pending: 0, done: 2 });
    render(<PeerTubeImportCard />);
    await upload();
    expect(screen.getByText(/Follows: 1 requested, 1 pending/)).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(screen.getByText("Follow import finished. Remote servers may still accept or reject follow requests.")).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(mocks.status).toHaveBeenCalledTimes(2);
  });

  it("keeps the import summary on status errors and retries progress without reimporting", async () => {
    mocks.status.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ ...progress, pending: 0 });
    render(<PeerTubeImportCard />);
    await upload();
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry follow status" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Retry follow status" }));
    await waitFor(() => expect(screen.getByText(/Follow import finished/)).toBeTruthy());
    expect(mocks.upload).toHaveBeenCalledTimes(1);
  });

  it("aborts pending requests and polling on unmount", async () => {
    vi.useFakeTimers();
    const { unmount } = render(<PeerTubeImportCard />);
    await upload();
    const signal = mocks.status.mock.calls[0][1] as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(mocks.status).toHaveBeenCalledTimes(1);
  });

  it("reports an upload error and allows another attempt", async () => {
    mocks.upload.mockRejectedValueOnce(new Error("offline"));
    render(<PeerTubeImportCard />);
    await upload();
    expect(screen.getByRole("alert").textContent).toContain("The PeerTube import failed.");
    expect((screen.getByRole("button", { name: "Import PeerTube archive" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("pauses and resumes status polling without cancelling the background import", async () => {
    vi.useFakeTimers();
    render(<PeerTubeImportCard />);
    await upload();
    fireEvent.click(screen.getByRole("button", { name: "Pause status updates" }));
    expect((mocks.status.mock.calls[0][1] as AbortSignal).aborted).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(mocks.status).toHaveBeenCalledTimes(1);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Resume status updates" })); });
    expect(mocks.status).toHaveBeenCalledTimes(2);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
  });

  it("cancels an in-flight upload and ignores its late response", async () => {
    let finish: (value: typeof summary) => void = () => {};
    mocks.upload.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<PeerTubeImportCard />);
    await upload();
    fireEvent.click(screen.getByRole("button", { name: "Cancel upload" }));
    expect((mocks.upload.mock.calls[0][1] as AbortSignal).aborted).toBe(true);
    await act(async () => { finish(summary); });
    expect(screen.queryByText("PeerTube archive imported")).toBeNull();
    expect(mocks.status).not.toHaveBeenCalled();
  });

  it.each([
    [413, "This archive exceeds the instance upload limit."],
    [422, "This file is not a valid PeerTube account export."],
    [403, "Archive imports are disabled on this instance."],
    [429, "Too many import attempts."],
  ])("explains an HTTP %s refusal", async (status, message) => {
    mocks.upload.mockRejectedValueOnce(new mocks.ApiError(Number(status)));
    render(<PeerTubeImportCard />);
    await upload();
    expect(screen.getByRole("alert").textContent).toContain(message);
  });

  it("renders the French import surface using the active locale", () => {
    render(<I18nProvider locale="fr" messages={fr}><PeerTubeImportCard /></I18nProvider>);
    expect(screen.getByRole("heading", { name: "Importer depuis PeerTube" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Importer l’archive PeerTube" })).toBeTruthy();
  });
});
