// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Video } from "@/lib/api";

const mocks = vi.hoisted(() => ({
  permissions: {
    signedIn: true,
    privileged: false,
    canManage: false,
    canDownload: false,
  },
  push: vi.fn(),
  saveVideo: vi.fn(),
  deleteVideo: vi.fn(),
  blockVideo: vi.fn(),
  runVideoTranscoding: vi.fn(),
  requestAutoCaption: vi.fn(),
  playlistDialog: vi.fn(),
  downloadDialog: vi.fn(),
  shareDialog: vi.fn(),
  reportDialog: vi.fn(),
}));

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, String(value));
    },
  };
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/lib/use-video-action-permissions", () => ({
  useVideoActionPermissions: () => ({ ...mocks.permissions }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    saveVideo: mocks.saveVideo,
    deleteVideo: mocks.deleteVideo,
    blockVideo: mocks.blockVideo,
    runVideoTranscoding: mocks.runVideoTranscoding,
    requestAutoCaption: mocks.requestAutoCaption,
  },
  errorMessage: (_error: unknown, fallback: string) => fallback,
}));

vi.mock("@/components/PlaylistPickerDialog", () => ({
  PlaylistPickerDialog: (props: { videoId: string; onClose: () => void }) => {
    mocks.playlistDialog(props);
    return <div role="dialog" aria-label="Playlist picker" />;
  },
}));

vi.mock("@/components/DownloadButton", () => ({
  DownloadDialog: (props: { videoId: string; onClose: () => void }) => {
    mocks.downloadDialog(props);
    return <div role="dialog" aria-label="Download video" />;
  },
}));

vi.mock("@/components/ShareButton", () => ({
  ShareDialog: (props: { videoId: string; watchPath?: string; onClose: () => void }) => {
    mocks.shareDialog(props);
    return <div role="dialog" aria-label="Share video" />;
  },
}));

vi.mock("@/components/ReportButton", () => ({
  ReportDialog: (props: { kind: string; targetId: string; onClose: () => void }) => {
    mocks.reportDialog(props);
    return <div role="dialog" aria-label="Report video" />;
  },
}));

import { ToastProvider } from "@/components/ui";
import { VideoActionsMenu } from "@/components/VideoActionsMenu";
import { resetVideoQueueForTests } from "@/lib/video-queue";

function video(overrides: Partial<Video> = {}): Video {
  return {
    id: "video-1",
    channel_id: "channel-1",
    title: "A carefully graded film",
    description: "",
    privacy: "public",
    state: "published",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as Video;
}

function renderMenu(item = video(), onDeleted = vi.fn()) {
  render(
    <ToastProvider>
      <VideoActionsMenu video={item} onDeleted={onDeleted} />
    </ToastProvider>,
  );
  return { onDeleted };
}

function openMenu(title = "A carefully graded film") {
  fireEvent.click(screen.getByRole("button", { name: `Actions for ${title}` }));
}

function menuLabels(): string[] {
  return screen.getAllByRole("menuitem").map((item) => item.textContent ?? "");
}

beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: memoryStorage(),
  });
  Object.assign(mocks.permissions, {
    signedIn: true,
    privileged: false,
    canManage: false,
    canDownload: false,
  });
  mocks.saveVideo.mockResolvedValue(undefined);
  mocks.deleteVideo.mockResolvedValue(undefined);
  mocks.blockVideo.mockResolvedValue(undefined);
  mocks.runVideoTranscoding.mockResolvedValue({ status: "queued" });
  mocks.requestAutoCaption.mockResolvedValue({ status: "queued" });
  resetVideoQueueForTests();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  resetVideoQueueForTests();
});

describe("VideoActionsMenu", () => {
  it("uses the larger vertical-dot glyph while retaining a 40px action target", () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: "Actions for A carefully graded film" });
    const icon = trigger.querySelector("svg");
    expect(icon?.getAttribute("width")).toBe("26");
    expect(trigger.className).toContain("h-10");
    expect(trigger.className).toContain("w-10");
  });

  it("shows every local action in the requested order when policy allows it", () => {
    Object.assign(mocks.permissions, { privileged: true, canManage: true, canDownload: true });
    renderMenu();
    openMenu();

    expect(menuLabels()).toEqual([
      "Add to queue",
      "Watch later",
      "Save to playlist",
      "Download",
      "Share",
      "Manage",
      "Block",
      "Delete",
      "Run HLS transcoding",
      "Run Web Video transcoding",
      "Generate caption",
      "Report",
    ]);
  });

  it("hides download and owner-only actions when permission is absent", () => {
    renderMenu();
    openMenu();

    expect(menuLabels()).toEqual([
      "Add to queue",
      "Watch later",
      "Save to playlist",
      "Share",
      "Report",
    ]);
  });

  it("offers only supported actions for a federated video", () => {
    // The permission hook rejects local-only capabilities for federated cards,
    // including for a privileged local account.
    Object.assign(mocks.permissions, { privileged: true, canManage: false, canDownload: false });
    renderMenu(video({ remote: true, domain: "video.example" }));
    openMenu();

    expect(menuLabels()).toEqual(["Add to queue", "Share", "Report"]);
  });

  it("adds to the queue idempotently and tells the viewer what happened", async () => {
    renderMenu();

    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Add to queue" }));
    expect((await screen.findByRole("status")).textContent).toContain(
      "“A carefully graded film” added to the queue.",
    );

    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Add to queue" }));
    const statuses = await screen.findAllByRole("status");
    expect(statuses[statuses.length - 1]?.textContent).toContain(
      "“A carefully graded film” is already queued.",
    );
  });

  it("sends signed-out viewers to login for account-backed actions", () => {
    Object.assign(mocks.permissions, { signedIn: false });
    renderMenu();

    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Watch later" }));
    expect(mocks.push).toHaveBeenCalledWith("/login");
    expect(mocks.saveVideo).not.toHaveBeenCalled();
  });

  it("saves to Watch later and opens the playlist, download, share, and report dialogs", async () => {
    Object.assign(mocks.permissions, { canDownload: true });
    renderMenu();

    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Watch later" }));
    await waitFor(() => expect(mocks.saveVideo).toHaveBeenCalledWith("video-1"));

    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Save to playlist" }));
    expect(screen.getByRole("dialog", { name: "Playlist picker" })).toBeTruthy();
    cleanup();

    renderMenu();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Download" }));
    expect(screen.getByRole("dialog", { name: "Download video" })).toBeTruthy();
    cleanup();

    renderMenu();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Share" }));
    expect(screen.getByRole("dialog", { name: "Share video" })).toBeTruthy();
    cleanup();

    renderMenu();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Report" }));
    expect(screen.getByRole("dialog", { name: "Report video" })).toBeTruthy();
  });

  it("routes to management and deletes only after confirmation", async () => {
    Object.assign(mocks.permissions, { canManage: true });
    const { onDeleted } = renderMenu();

    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Manage" }));
    expect(mocks.push).toHaveBeenCalledWith("/studio?video=video-1");

    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(screen.getByRole("dialog", { name: "Delete video?" })).toBeTruthy();
    expect(mocks.deleteVideo).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mocks.deleteVideo).toHaveBeenCalledWith("video-1"));
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it("runs moderator recovery actions from the video menu", async () => {
    Object.assign(mocks.permissions, { privileged: true, canManage: true });
    renderMenu();

    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Block" }));
    await waitFor(() => expect(mocks.blockVideo).toHaveBeenCalledWith("video-1"));

    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Run HLS transcoding" }));
    await waitFor(() => expect(mocks.runVideoTranscoding).toHaveBeenCalledWith("video-1", "hls"));

    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Run Web Video transcoding" }));
    await waitFor(() => expect(mocks.runVideoTranscoding).toHaveBeenCalledWith("video-1", "web_video"));

    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Generate caption" }));
    await waitFor(() => expect(mocks.requestAutoCaption).toHaveBeenCalledWith("video-1"));
  });
});
