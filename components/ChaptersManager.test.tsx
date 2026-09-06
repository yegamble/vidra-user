// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChaptersManager } from "./ChaptersManager";
import { api } from "@/lib/api";

afterEach(cleanup);

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("ChaptersManager", () => {
  it("prevents replacing unknown chapters until the initial read completes", async () => {
    vi.spyOn(api, "getVideoChapters").mockReturnValue(new Promise(() => {}));
    const put = vi.spyOn(api, "setVideoChapters");
    render(<ChaptersManager videoId="v1" />);
    expect(screen.getByRole("button", { name: "Save chapters" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Add chapter" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Save chapters" }));
    expect(put).not.toHaveBeenCalled();
  });

  it("reports a failed read and retries the authoritative set before editing", async () => {
    vi.spyOn(api, "getVideoChapters")
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ chapters: [{ start_seconds: 0, title: "Existing intro" }] });
    const put = vi.spyOn(api, "setVideoChapters").mockResolvedValue({
      chapters: [{ start_seconds: 0, title: "Edited intro" }],
    });
    render(<ChaptersManager videoId="v1" />);
    await screen.findByText("Could not load chapters");
    expect(screen.queryByText("No chapters yet.")).toBeNull();
    expect(screen.getByRole("button", { name: "Save chapters" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByDisplayValue("Existing intro");
    fireEvent.change(screen.getByLabelText("Chapter 1 title"), { target: { value: "Edited intro" } });
    fireEvent.click(screen.getByRole("button", { name: "Save chapters" }));
    await waitFor(() => expect(put).toHaveBeenCalledWith("v1", {
      chapters: [{ start_seconds: 0, title: "Edited intro" }],
    }));
  });

  it("loads and renders the video's existing chapters as editable rows", async () => {
    vi.spyOn(api, "getVideoChapters").mockResolvedValue({
      chapters: [
        { start_seconds: 0, title: "Intro" },
        { start_seconds: 90, title: "The Build" },
      ],
    });
    render(<ChaptersManager videoId="v1" durationSeconds={600} />);

    expect(await screen.findByDisplayValue("Intro")).toBeTruthy();
    // 90s renders as the m:ss the editor accepts.
    expect((screen.getByLabelText("Chapter 2 start") as HTMLInputElement).value).toBe("1:30");
    expect(screen.getByDisplayValue("The Build")).toBeTruthy();
  });

  it("shows an empty state and adds / removes rows", async () => {
    vi.spyOn(api, "getVideoChapters").mockResolvedValue({ chapters: [] });
    render(<ChaptersManager videoId="v1" />);

    expect(await screen.findByText("No chapters yet.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add chapter" }));
    expect(screen.getByLabelText("Chapter 1 start")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add chapter" }));
    expect(screen.getByLabelText("Chapter 2 start")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remove chapter 1" }));
    // One row left; no second row.
    expect(screen.getByLabelText("Chapter 1 start")).toBeTruthy();
    expect(screen.queryByLabelText("Chapter 2 start")).toBeNull();
  });

  it("blocks save and shows inline errors for a bad time / empty title", async () => {
    vi.spyOn(api, "getVideoChapters").mockResolvedValue({ chapters: [] });
    const put = vi.spyOn(api, "setVideoChapters");
    render(<ChaptersManager videoId="v1" durationSeconds={600} />);
    await screen.findByText("No chapters yet.");

    fireEvent.click(screen.getByRole("button", { name: "Add chapter" }));
    fireEvent.change(screen.getByLabelText("Chapter 1 start"), { target: { value: "nope" } });
    // Leave the title blank.
    fireEvent.click(screen.getByRole("button", { name: "Save chapters" }));

    expect(await screen.findByText("Enter a time like 1:30.")).toBeTruthy();
    expect(screen.getByText("Add a chapter title.")).toBeTruthy();
    expect(put).not.toHaveBeenCalled();
  });

  it("flags a non-increasing start across rows", async () => {
    vi.spyOn(api, "getVideoChapters").mockResolvedValue({ chapters: [] });
    const put = vi.spyOn(api, "setVideoChapters");
    render(<ChaptersManager videoId="v1" />);
    await screen.findByText("No chapters yet.");

    fireEvent.click(screen.getByRole("button", { name: "Add chapter" }));
    fireEvent.click(screen.getByRole("button", { name: "Add chapter" }));
    fireEvent.change(screen.getByLabelText("Chapter 1 start"), { target: { value: "2:00" } });
    fireEvent.change(screen.getByLabelText("Chapter 1 title"), { target: { value: "First" } });
    fireEvent.change(screen.getByLabelText("Chapter 2 start"), { target: { value: "1:00" } });
    fireEvent.change(screen.getByLabelText("Chapter 2 title"), { target: { value: "Second" } });
    fireEvent.click(screen.getByRole("button", { name: "Save chapters" }));

    expect(await screen.findByText("Times must increase down the list.")).toBeTruthy();
    expect(put).not.toHaveBeenCalled();
  });

  it("saves the parsed, whole set and confirms success", async () => {
    vi.spyOn(api, "getVideoChapters").mockResolvedValue({ chapters: [] });
    const put = vi.spyOn(api, "setVideoChapters").mockResolvedValue({
      chapters: [
        { start_seconds: 0, title: "Intro" },
        { start_seconds: 60, title: "The Build" },
      ],
    });
    render(<ChaptersManager videoId="v1" durationSeconds={600} />);
    await screen.findByText("No chapters yet.");

    fireEvent.click(screen.getByRole("button", { name: "Add chapter" }));
    fireEvent.click(screen.getByRole("button", { name: "Add chapter" }));
    fireEvent.change(screen.getByLabelText("Chapter 1 start"), { target: { value: "0:00" } });
    fireEvent.change(screen.getByLabelText("Chapter 1 title"), { target: { value: "Intro" } });
    fireEvent.change(screen.getByLabelText("Chapter 2 start"), { target: { value: "1:00" } });
    fireEvent.change(screen.getByLabelText("Chapter 2 title"), { target: { value: "The Build" } });
    fireEvent.click(screen.getByRole("button", { name: "Save chapters" }));

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith("v1", {
        chapters: [
          { start_seconds: 0, title: "Intro" },
          { start_seconds: 60, title: "The Build" },
        ],
      }),
    );
    expect(await screen.findByText("Chapters saved.")).toBeTruthy();
  });

  it("saves an empty set to clear all chapters", async () => {
    vi.spyOn(api, "getVideoChapters").mockResolvedValue({
      chapters: [{ start_seconds: 0, title: "Intro" }],
    });
    const put = vi.spyOn(api, "setVideoChapters").mockResolvedValue({ chapters: [] });
    render(<ChaptersManager videoId="v1" />);

    await screen.findByDisplayValue("Intro");
    fireEvent.click(screen.getByRole("button", { name: "Remove chapter 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Save chapters" }));

    await waitFor(() => expect(put).toHaveBeenCalledWith("v1", { chapters: [] }));
  });
});
