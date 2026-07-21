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
    updateVideo: vi.fn(),
    deleteVideo: vi.fn(),
    resumableUpload: vi.fn(),
  };
});

vi.mock("@/lib/api", () => ({
  ApiError: mocks.FakeApiError,
  api: {
    getInstance: mocks.getInstance,
    cancelUploadSession: mocks.cancelUploadSession,
    createVideoDraft: mocks.createVideoDraft,
    updateVideo: mocks.updateVideo,
    deleteVideo: mocks.deleteVideo,
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
  // Auto-start defaults: selecting a single file now immediately creates a
  // private draft and runs the resumable upload, so every file-path test needs
  // these wired even when it only cares about the metadata form.
  mocks.createVideoDraft.mockResolvedValue({ id: "v1", state: "draft" });
  mocks.resumableUpload.mockResolvedValue({
    video: { id: "v1", title: "clip", state: "published" },
    file: { kind: "original" },
  });
  mocks.updateVideo.mockResolvedValue({ id: "v1", title: "clip", state: "published" });
  mocks.deleteVideo.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// The upload form lives inside the stepped "Upload video" sheet. Selecting a
// single file now AUTO-ADVANCES to the details stage and AUTO-STARTS the upload
// (no separate Continue), so these helpers reach the metadata form by selecting.
function openSheet() {
  fireEvent.click(screen.getByRole("button", { name: "Upload video" }));
}

function pickFile(name = "clip.mp4") {
  fireEvent.change(screen.getByLabelText("Video file"), {
    target: { files: [new File(["v"], name, { type: "video/mp4" })] },
  });
}

describe("UploadSection defaults.publish prefill (W9 race regression)", () => {
  it("prefills untouched fields once /instance resolves", async () => {
    render(<UploadSection channels={[channel]} config={null} />);
    await waitFor(() => expect(mocks.getInstance).toHaveBeenCalled());
    // Reach the details stage: open the sheet and pick a file (auto-advances).
    openSheet();
    pickFile();
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
    pickFile();
    // Wait for the details stage (the auto-advance) before touching fields.
    await waitFor(() => expect(screen.getByLabelText("Privacy")).toBeTruthy());

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

  it("auto-starts the upload on file select (title-only private draft) and Publish PATCHes metadata", async () => {
    // The new contract: selecting a file immediately creates a PRIVATE draft with
    // just the title (from the filename) and runs resumableUpload; Publish then
    // PATCHes the typed metadata and derives the outcome. On success the sheet
    // minimizes and the section shows the honest published result.
    mocks.resumableUpload.mockResolvedValue({
      video: { id: "v1", title: "clip", state: "published" },
      file: { kind: "original" },
    });
    mocks.createVideoDraft.mockResolvedValue({ id: "v1", state: "draft" });
    mocks.updateVideo.mockResolvedValue({ id: "v1", title: "Sheet clip", state: "published" });
    render(<UploadSection channels={[channel]} config={null} />);
    await waitFor(() => expect(mocks.getInstance).toHaveBeenCalled());

    openSheet();
    pickFile();

    // The upload started on select — title-only draft, explicit private, no other
    // metadata; resumableUpload ran for it.
    await waitFor(() =>
      expect(mocks.createVideoDraft).toHaveBeenCalledWith("ada", {
        title: "clip",
        privacy: "private",
      }),
    );
    await waitFor(() => expect(mocks.resumableUpload).toHaveBeenCalled());

    // The creator overrides the prefilled title, then Publishes.
    fireEvent.change(screen.getByLabelText("Video title"), { target: { value: "Sheet clip" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(mocks.updateVideo).toHaveBeenCalled());
    const [patchedId, patchBody] = mocks.updateVideo.mock.calls[0];
    expect(patchedId).toBe("v1");
    expect(patchBody).toMatchObject({ title: "Sheet clip", privacy: "private" });
    // Success surfaces at the section level (the sheet closed on publish).
    await waitFor(() => expect(screen.getByText("Published!")).toBeTruthy());
  });

  it("prefills the title from the filename but never clobbers a typed title", async () => {
    // resumableUpload rejects on abort so Cancel returns to the pick step.
    mocks.resumableUpload.mockImplementation(
      (_id: string, _file: File, opts: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener("abort", () =>
            reject(new mocks.FakeApiError({ status: 0, code: "upload_cancelled", message: "x" })),
          );
        }),
    );
    render(<UploadSection channels={[channel]} config={null} />);
    await waitFor(() => expect(mocks.getInstance).toHaveBeenCalled());

    openSheet();
    pickFile("first-clip.mp4");
    // The title prefilled from the filename.
    const title = () => screen.getByLabelText("Video title") as HTMLInputElement;
    await waitFor(() => expect(title().value).toBe("first-clip"));

    // The creator types their own title (marks it touched)…
    fireEvent.change(title(), { target: { value: "My Own Title" } });
    // …and cancels the in-flight upload, returning to the pick step with the
    // metadata (title) kept.
    fireEvent.click(screen.getByRole("button", { name: "Cancel upload" }));
    await waitFor(() => expect(screen.getByLabelText("Video file")).toBeTruthy());

    // Selecting a DIFFERENT file must NOT overwrite the typed title.
    pickFile("second-clip.mp4");
    await waitFor(() => expect(screen.getByLabelText("Video title")).toBeTruthy());
    expect(title().value).toBe("My Own Title");
    // The re-created draft still carries the typed title, not the new filename.
    const lastDraft = mocks.createVideoDraft.mock.calls.at(-1);
    expect(lastDraft?.[1]).toMatchObject({ title: "My Own Title", privacy: "private" });
  });

  // A resumableUpload mock that stays in flight until the abort signal fires —
  // keeps the details step live so the publish-timing toggle can be exercised.
  function heldUpload() {
    mocks.resumableUpload.mockImplementation(
      (_id: string, _file: File, opts: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener("abort", () =>
            reject(new mocks.FakeApiError({ status: 0, code: "upload_cancelled", message: "x" })),
          );
        }),
    );
  }

  it("flipping Publish after transcoding syncs an immediate single-field PATCH", async () => {
    mocks.createVideoDraft.mockResolvedValue({ id: "v1", state: "draft" });
    heldUpload();
    render(<UploadSection channels={[channel]} config={null} />);
    await waitFor(() => expect(mocks.getInstance).toHaveBeenCalled());

    openSheet();
    pickFile();
    await waitFor(() => expect(mocks.createVideoDraft).toHaveBeenCalled());
    // The default-off create body carries NO publish_after_transcode.
    expect(mocks.createVideoDraft.mock.calls[0][1]).toEqual({
      title: "clip",
      privacy: "private",
    });

    fireEvent.click(screen.getByRole("switch", { name: "Publish after transcoding" }));
    // The flip PATCHes the draft immediately (the hold decision happens at
    // upload completion — the flag must land before the bytes finish).
    await waitFor(() =>
      expect(mocks.updateVideo).toHaveBeenCalledWith("v1", { publish_after_transcode: true }),
    );
    expect(
      screen
        .getByRole("switch", { name: "Publish after transcoding" })
        .getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("a failed publish-timing sync reverts the toggle and shows an inline error", async () => {
    mocks.createVideoDraft.mockResolvedValue({ id: "v1", state: "draft" });
    heldUpload();
    mocks.updateVideo.mockRejectedValue(
      new mocks.FakeApiError({ status: 500, code: "internal", message: "boom" }),
    );
    render(<UploadSection channels={[channel]} config={null} />);
    await waitFor(() => expect(mocks.getInstance).toHaveBeenCalled());

    openSheet();
    pickFile();
    await waitFor(() => expect(mocks.createVideoDraft).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("switch", { name: "Publish after transcoding" }));
    await waitFor(() =>
      // The mocked errorMessage returns the fallback copy verbatim.
      expect(
        screen.getByText("Couldn’t update the publish timing. Please try again."),
      ).toBeTruthy(),
    );
    expect(
      screen
        .getByRole("switch", { name: "Publish after transcoding" })
        .getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("carries the sticky publish-timing opt-in on the auto-create draft body", async () => {
    // The toggle lives on the details step (reached after the first select), so
    // the create-body path is: flip → cancel → re-pick — the sticky value then
    // rides the fresh auto-create call.
    mocks.createVideoDraft.mockResolvedValue({ id: "v1", state: "draft" });
    heldUpload();
    render(<UploadSection channels={[channel]} config={null} />);
    await waitFor(() => expect(mocks.getInstance).toHaveBeenCalled());

    openSheet();
    pickFile();
    await waitFor(() => expect(mocks.createVideoDraft).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("switch", { name: "Publish after transcoding" }));
    await waitFor(() => expect(mocks.updateVideo).toHaveBeenCalled());

    // Cancel back to the pick step, then re-pick: the create body carries the flag.
    fireEvent.click(screen.getByRole("button", { name: "Cancel upload" }));
    await waitFor(() => expect(screen.getByLabelText("Video file")).toBeTruthy());
    pickFile("clip2.mp4");
    await waitFor(() => expect(mocks.createVideoDraft).toHaveBeenCalledTimes(2));
    expect(mocks.createVideoDraft.mock.calls[1][1]).toMatchObject({
      publish_after_transcode: true,
      privacy: "private",
    });
  });

  it("disables the publish-timing toggle while a schedule is set (publish_at wins)", async () => {
    render(<UploadSection channels={[channel]} config={null} />);
    await waitFor(() => expect(mocks.getInstance).toHaveBeenCalled());

    openSheet();
    pickFile();
    await waitFor(() => expect(screen.getByLabelText("Schedule publish")).toBeTruthy());

    const toggle = () =>
      screen.getByRole("switch", { name: "Publish after transcoding" }) as HTMLButtonElement;
    expect(toggle().disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("Schedule publish"), {
      target: { value: "2030-01-02T12:30" },
    });
    expect(toggle().disabled).toBe(true);
    expect(screen.getByText("Scheduled videos publish at the scheduled time.")).toBeTruthy();
    // Clearing the schedule re-enables it.
    fireEvent.change(screen.getByLabelText("Schedule publish"), { target: { value: "" } });
    expect(toggle().disabled).toBe(false);
  });

  it("cancelling an in-flight upload deletes the auto-created draft", async () => {
    mocks.createVideoDraft.mockResolvedValue({ id: "draft-9", state: "draft" });
    mocks.resumableUpload.mockImplementation(
      (_id: string, _file: File, opts: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener("abort", () =>
            reject(new mocks.FakeApiError({ status: 0, code: "upload_cancelled", message: "x" })),
          );
        }),
    );
    render(<UploadSection channels={[channel]} config={null} />);
    await waitFor(() => expect(mocks.getInstance).toHaveBeenCalled());

    openSheet();
    pickFile();
    await waitFor(() => expect(mocks.createVideoDraft).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Cancel upload" }));
    await waitFor(() => expect(mocks.deleteVideo).toHaveBeenCalledWith("draft-9"));
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
