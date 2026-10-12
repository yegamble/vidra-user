// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  downloadCaptionText: vi.fn(),
  uploadCaption: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: { downloadCaptionText: mocks.downloadCaptionText, uploadCaption: mocks.uploadCaption },
  errorMessage: (_e: unknown, fallback: string) => fallback,
}));

import { CaptionCueEditor } from "@/components/CaptionCueEditor";

const VTT = `WEBVTT

NOTE keep me

intro
00:01.000 --> 00:02.000 align:start
Fish &amp; chips

00:03.000 --> 00:04.000
Second
`;

function mount(onSaved = vi.fn(), onClose = vi.fn()) {
  render(<CaptionCueEditor videoId="v1" language="en" label="English" onClose={onClose} onSaved={onSaved} />);
  return { onSaved, onClose };
}

beforeEach(() => {
  mocks.downloadCaptionText.mockResolvedValue(VTT);
  mocks.uploadCaption.mockResolvedValue({ language: "en", label: "English", created_at: "" });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function uploadedText(): Promise<string> {
  const file = mocks.uploadCaption.mock.calls[0][1].file as File;
  return await file.text();
}

describe("CaptionCueEditor", () => {
  it("lists the cues with times and text", async () => {
    mount();
    expect(await screen.findByLabelText("Cue 1 start")).toHaveProperty("value", "00:01.000");
    expect(screen.getByLabelText("Cue 1 end")).toHaveProperty("value", "00:02.000");
    expect(screen.getByLabelText("Cue 1 text")).toHaveProperty("value", "Fish &amp; chips");
    expect(screen.getByLabelText("Cue 2 text")).toHaveProperty("value", "Second");
  });

  it("saves an edit through the replace-by-language upload, preserving NOTE, id and settings", async () => {
    const { onSaved } = mount();
    const text = await screen.findByLabelText("Cue 2 text");
    fireEvent.change(text, { target: { value: "Changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save cues" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(mocks.uploadCaption.mock.calls[0][0]).toBe("v1");
    expect(mocks.uploadCaption.mock.calls[0][1]).toMatchObject({ language: "en", label: "English" });
    expect(await uploadedText()).toBe(VTT.replace("Second", "Changed"));
  });

  it("blocks saving while a cue starts after it ends", async () => {
    mount();
    fireEvent.change(await screen.findByLabelText("Cue 1 start"), { target: { value: "00:05.000" } });
    expect(screen.getByText("Start must be before the end.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save cues" })).toHaveProperty("disabled", true);
  });

  it("warns, without blocking, when cues overlap", async () => {
    mount();
    fireEvent.change(await screen.findByLabelText("Cue 2 start"), { target: { value: "00:01.500" } });
    expect(screen.getByText("Overlaps the previous cue.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save cues" })).toHaveProperty("disabled", false);
  });

  it("adds a cue after one and deletes a cue", async () => {
    mount();
    await screen.findByLabelText("Cue 1 text");
    fireEvent.click(screen.getByRole("button", { name: "Add cue after 1" }));
    const added = screen.getByLabelText("Cue 2 text") as HTMLTextAreaElement;
    expect(added.value).toBe("");
    expect(screen.getByLabelText("Cue 2 start")).toHaveProperty("value", "00:02.000");
    // the empty new cue must be filled in before saving
    expect(screen.getByRole("button", { name: "Save cues" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Delete cue 2" }));
    expect(screen.getByLabelText("Cue 2 text")).toHaveProperty("value", "Second");
  });

  it("shows an error when the track cannot be loaded", async () => {
    mocks.downloadCaptionText.mockRejectedValue(new Error("nope"));
    mount();
    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("surfaces a save failure and stays open", async () => {
    mocks.uploadCaption.mockRejectedValue(new Error("boom"));
    const { onSaved } = mount();
    fireEvent.change(await screen.findByLabelText("Cue 2 text"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Save cues" }));
    expect(await screen.findByText("Could not save the caption.")).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("renders 2,000 cues", async () => {
    const big = ["WEBVTT", ""];
    for (let i = 0; i < 2000; i++) {
      big.push(`00:00.${String(i % 1000).padStart(3, "0")} --> 59:00.000`, `line ${i}`, "");
    }
    mocks.downloadCaptionText.mockResolvedValue(big.join("\n"));
    mount();
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("2000 cues"), { timeout: 20000 });
    expect(document.querySelectorAll("textarea")).toHaveLength(2000);
  });
});
