// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class FakeApiError extends Error {
    status: number;
    code: string;
    constructor(args: { status: number; code: string; message: string }) {
      super(args.message);
      this.status = args.status;
      this.code = args.code;
    }
  }
  return {
    FakeApiError,
    getInstance: vi.fn(),
    cancelUploadSession: vi.fn(),
    createVideoDraft: vi.fn(),
    resumableUpload: vi.fn(),
  };
});

vi.mock("@/lib/api", () => ({
  ApiError: mocks.FakeApiError,
  api: {
    getInstance: mocks.getInstance,
    cancelUploadSession: mocks.cancelUploadSession,
    createVideoDraft: mocks.createVideoDraft,
  },
  channelAvatarUrl: () => "",
  channelBannerUrl: () => "",
  errorMessage: (_error: unknown, fallback: string) => fallback,
  findResumableUploadSession: () => null,
  forgetUploadSession: () => {},
  isSensitiveVideo: () => false,
  isUploadCancelled: (err: unknown) =>
    err instanceof mocks.FakeApiError && err.code === "upload_cancelled",
  resumableUpload: mocks.resumableUpload,
  videoThumbnailUrl: () => "",
}));

import { UploadSection } from "@/components/studio/UploadSection";
import { ReplaceVideoManager } from "@/components/studio/VideoRow";
import type { Channel, Video } from "@/lib/api";

const channel = {
  id: "ch-1",
  handle: "ada",
  display_name: "Ada",
} as unknown as Channel;

// A controllable GET /instance so the prefill test can resolve it AFTER the
// user has already touched a field.
function deferredInstance() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((r) => {
    resolve = r;
  });
  mocks.getInstance.mockReturnValue(promise);
  return (payload: unknown) => resolve(payload);
}

const instanceWithDefaults = {
  features: { imports: true, upload_additional_extensions: true, video_replace: true },
  defaults: {
    publish: {
      privacy: "private",
      licence: 0,
      comment_policy: "disabled",
      download_enabled: false,
    },
  },
};

beforeEach(() => {
  mocks.getInstance.mockResolvedValue(instanceWithDefaults);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// The upload form now lives inside the stepped "Upload video" sheet (design's
// Upload sheet): a launcher button opens a Modal staging pick → details →
// publish. These helpers drive that flow so the prefill/accept coverage below
// exercises the same fields it always did, just reached through the sheet.
function openSheet() {
  fireEvent.click(screen.getByRole("button", { name: "Upload video" }));
}

function pickFileAndContinue() {
  fireEvent.change(screen.getByLabelText("Video file"), {
    target: { files: [new File(["v"], "clip.mp4", { type: "video/mp4" })] },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

describe("UploadSection defaults.publish prefill (W9 race regression)", () => {
  it("prefills untouched fields once /instance resolves", async () => {
    render(<UploadSection channels={[channel]} config={null} />);
    await waitFor(() => expect(mocks.getInstance).toHaveBeenCalled());
    // Reach the details stage: open the sheet, pick a file, Continue.
    openSheet();
    pickFileAndContinue();
    // Untouched form: every defaults.publish field applies.
    await waitFor(() => {
      expect(screen.getByLabelText("Privacy")).toHaveProperty("value", "private");
    });
    expect(screen.getByRole("switch", { name: "Allow comments" }).getAttribute("aria-checked")).toBe(
      "false",
    );
    expect(
      screen.getByRole("switch", { name: "Allow downloads" }).getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("never clobbers a field the creator touched before /instance resolved", async () => {
    const resolveInstance = deferredInstance();
    render(<UploadSection channels={[channel]} config={null} />);
    openSheet();
    pickFileAndContinue();

    // The creator picks values while GET /instance is still in flight…
    fireEvent.change(screen.getByLabelText("Privacy"), { target: { value: "unlisted" } });
    fireEvent.click(screen.getByRole("switch", { name: "Allow comments" })); // enabled -> disabled

    // …then the slow instance payload lands with different defaults.
    resolveInstance(instanceWithDefaults);
    await waitFor(() => {
      // The UNTOUCHED download toggle takes the instance default (false)…
      expect(
        screen.getByRole("switch", { name: "Allow downloads" }).getAttribute("aria-checked"),
      ).toBe("false");
    });
    // …while the touched fields keep the creator's explicit choices.
    expect(screen.getByLabelText("Privacy")).toHaveProperty("value", "unlisted");
    expect(screen.getByRole("switch", { name: "Allow comments" }).getAttribute("aria-checked")).toBe(
      "false", // the creator turned comments off; the default is also disabled — assert it stayed off
    );
  });

  it("narrows the file picker accept list when the extended container set is off (W10)", async () => {
    mocks.getInstance.mockResolvedValue({
      features: { imports: true, upload_additional_extensions: false },
    });
    render(<UploadSection channels={[channel]} config={null} />);
    openSheet();
    await waitFor(() => {
      expect(screen.getByLabelText("Video file").getAttribute("accept")).toBe(
        ".mp4,.webm,.ogv,.ogg,video/mp4,video/webm,video/ogg",
      );
    });
  });

  it("keeps the permissive accept while the flag is on or unknown", async () => {
    render(<UploadSection channels={[channel]} config={null} />);
    openSheet();
    expect(screen.getByLabelText("Video file").getAttribute("accept")).toBe("video/*");
    await waitFor(() => expect(mocks.getInstance).toHaveBeenCalled());
    expect(screen.getByLabelText("Video file").getAttribute("accept")).toBe("video/*");
  });

  it("stages pick → details → publish and reuses the resumable upload logic", async () => {
    // A full drive through the sheet: open, pick a file, Continue to details,
    // fill the title, Publish — the same createVideoDraft → resumableUpload path,
    // now reached through the staged sheet. On success the sheet minimizes and
    // the section shows the honest published outcome.
    mocks.resumableUpload.mockResolvedValue({
      video: { id: "v1", title: "Sheet clip", state: "published" },
      file: { kind: "original" },
    });
    mocks.createVideoDraft.mockResolvedValue({ id: "v1", state: "draft" });
    render(<UploadSection channels={[channel]} config={null} />);
    await waitFor(() => expect(mocks.getInstance).toHaveBeenCalled());

    openSheet();
    pickFileAndContinue();
    fireEvent.change(screen.getByLabelText("Video title"), { target: { value: "Sheet clip" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(mocks.resumableUpload).toHaveBeenCalled());
    // Success surfaces at the section level (the sheet closed on publish).
    await waitFor(() => expect(screen.getByText("Published!")).toBeTruthy());
    expect(mocks.createVideoDraft).toHaveBeenCalledWith("ada", expect.objectContaining({ title: "Sheet clip" }));
  });
});

describe("ReplaceVideoManager (W14)", () => {
  const video = { id: "vid-1", state: "published", title: "Clip" } as unknown as Video;

  function pickFile() {
    const input = screen.getByLabelText("Replacement video file");
    fireEvent.change(input, {
      target: { files: [new File(["new bytes"], "v2.mp4", { type: "video/mp4" })] },
    });
    return input;
  }

  it("uploads the picked file through the replace-mode session and reports success", async () => {
    mocks.resumableUpload.mockResolvedValue({ video, file: { kind: "original" } });
    const onReplaced = vi.fn();
    render(<ReplaceVideoManager videoId="vid-1" accept="video/*" onReplaced={onReplaced} />);

    // Nothing picked yet: the Replace action is disabled.
    expect(screen.getByRole("button", { name: "Upload replacement" })).toHaveProperty(
      "disabled",
      true,
    );
    pickFile();
    fireEvent.click(screen.getByRole("button", { name: "Upload replacement" }));

    await waitFor(() => expect(onReplaced).toHaveBeenCalledWith(video));
    const [calledVideoId, calledFile, calledOpts] = mocks.resumableUpload.mock.calls[0];
    expect(calledVideoId).toBe("vid-1");
    expect((calledFile as File).name).toBe("v2.mp4");
    expect((calledOpts as { mode?: string }).mode).toBe("replace");
    expect(screen.getByRole("status").textContent).toContain("New file uploaded");
  });

  it("surfaces the server's replace_conflict reason verbatim", async () => {
    mocks.resumableUpload.mockRejectedValue(
      new mocks.FakeApiError({
        status: 409,
        code: "replace_conflict",
        message: "the video is still being processed; try again once processing finishes",
      }),
    );
    render(<ReplaceVideoManager videoId="vid-1" accept="video/*" onReplaced={vi.fn()} />);
    pickFile();
    fireEvent.click(screen.getByRole("button", { name: "Upload replacement" }));
    await waitFor(() => {
      expect(
        screen.getByText("the video is still being processed; try again once processing finishes"),
      ).toBeTruthy();
    });
  });

  it("explains a feature_disabled rejection honestly", async () => {
    mocks.resumableUpload.mockRejectedValue(
      new mocks.FakeApiError({ status: 403, code: "feature_disabled", message: "feature disabled" }),
    );
    render(<ReplaceVideoManager videoId="vid-1" accept="video/*" onReplaced={vi.fn()} />);
    pickFile();
    fireEvent.click(screen.getByRole("button", { name: "Upload replacement" }));
    await waitFor(() => {
      expect(
        screen.getByText("Replacing video files has been turned off on this instance."),
      ).toBeTruthy();
    });
  });
});
