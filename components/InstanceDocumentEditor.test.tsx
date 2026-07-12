// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getInstanceDocument: vi.fn(),
  putInstanceDocument: vi.fn(),
}));

// Spread the real module (keeping ApiError/errorMessage) and override only
// the document calls this editor makes — the ConfigForm test pattern.
vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getInstanceDocument: mocks.getInstanceDocument,
      putInstanceDocument: mocks.putInstanceDocument,
    },
  };
});

import { InstanceDocumentEditor } from "./InstanceDocumentEditor";

function doc(body: string) {
  return { name: "homepage", body, hash: body === "" ? "" : "h1" };
}

beforeEach(() => {
  mocks.getInstanceDocument.mockResolvedValue(doc(""));
  mocks.putInstanceDocument.mockImplementation((_name: string, body: string) =>
    Promise.resolve(doc(body)),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("InstanceDocumentEditor (homepage flavor)", () => {
  it("loads the stored document and saves the edited body via PUT", async () => {
    mocks.getInstanceDocument.mockResolvedValue(doc("# Old"));
    render(<InstanceDocumentEditor name="homepage" label="Homepage content" markdown />);

    const field = await screen.findByLabelText("Homepage content");
    expect((field as HTMLTextAreaElement).value).toBe("# Old");
    expect(mocks.getInstanceDocument).toHaveBeenCalledWith("homepage", expect.anything());

    // Save stays hidden work until something changes.
    const save = screen.getByRole("button", { name: "Save homepage content" });
    expect((save as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(field, { target: { value: "# Welcome" } });
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
    fireEvent.click(save);

    await waitFor(() => expect(mocks.putInstanceDocument).toHaveBeenCalledTimes(1));
    expect(mocks.putInstanceDocument).toHaveBeenCalledWith("homepage", "# Welcome");
    expect(await screen.findByText("Saved.")).toBeTruthy();
    expect(screen.queryByText("Unsaved changes")).toBeNull();
  });

  it("clears the stored document with an empty-body PUT after confirmation", async () => {
    mocks.getInstanceDocument.mockResolvedValue(doc("# Old"));
    render(<InstanceDocumentEditor name="homepage" label="Homepage content" markdown />);
    await screen.findByLabelText("Homepage content");

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    // Inline confirmation first — nothing sent yet.
    expect(mocks.putInstanceDocument).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm clearing Homepage content" }));

    await waitFor(() => expect(mocks.putInstanceDocument).toHaveBeenCalledTimes(1));
    expect(mocks.putInstanceDocument).toHaveBeenCalledWith("homepage", "");
    await waitFor(() =>
      expect((screen.getByLabelText("Homepage content") as HTMLTextAreaElement).value).toBe(""),
    );
    // Nothing stored anymore: no Clear affordance.
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
  });

  it("counts UTF-8 bytes against the cap and blocks saving over it", async () => {
    render(<InstanceDocumentEditor name="homepage" label="Homepage content" markdown />);
    const field = await screen.findByLabelText("Homepage content");

    expect(screen.getByText("0 KB of 100 KB")).toBeTruthy();
    fireEvent.change(field, { target: { value: "a".repeat(1024) } });
    expect(screen.getByText("1 KB of 100 KB")).toBeTruthy();

    // Over the 100 KiB cap: an inline error + the save is blocked client-side.
    fireEvent.change(field, { target: { value: "a".repeat(102401) } });
    expect(screen.getByText(/Too large/)).toBeTruthy();
    const save = screen.getByRole("button", { name: "Save homepage content" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(save);
    expect(mocks.putInstanceDocument).not.toHaveBeenCalled();
  });

  it("previews the markdown through the shared sanitized modal", async () => {
    render(<InstanceDocumentEditor name="homepage" label="Homepage content" markdown />);
    const field = await screen.findByLabelText("Homepage content");
    fireEvent.change(field, { target: { value: "## Hello\n\n**bold** <script>x()</script>" } });

    fireEvent.click(screen.getByRole("button", { name: "Preview Homepage content" }));
    const dialog = await screen.findByRole("dialog");
    // Markdown syntax renders as elements…
    expect(dialog.querySelector("strong")?.textContent).toBe("bold");
    expect(dialog.querySelector("h2, h3")).toBeTruthy();
    // …but raw HTML never becomes elements in the sanitized pipeline.
    expect(dialog.querySelector("script")).toBeNull();
  });

  it("surfaces a 422 field error from the backend cap", async () => {
    const { ApiError } = await import("@/lib/api");
    mocks.putInstanceDocument.mockRejectedValue(
      new ApiError({
        status: 422,
        code: "validation_failed",
        message: "validation failed",
        fields: [{ field: "body", message: "must be at most 102400 bytes" }],
      }),
    );
    render(<InstanceDocumentEditor name="homepage" label="Homepage content" markdown />);
    const field = await screen.findByLabelText("Homepage content");
    fireEvent.change(field, { target: { value: "# Hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Save homepage content" }));
    expect(await screen.findByText("must be at most 102400 bytes")).toBeTruthy();
  });
});

describe("InstanceDocumentEditor (custom JS: typed confirmation)", () => {
  it("blocks a non-empty save until the exact phrase is typed", async () => {
    render(
      <InstanceDocumentEditor name="custom_js" label="Custom JavaScript" code dangerConfirm />,
    );
    const field = await screen.findByLabelText("Custom JavaScript");
    fireEvent.change(field, { target: { value: "console.log(1)" } });
    fireEvent.click(screen.getByRole("button", { name: "Save custom javascript" }));

    // The danger modal opens INSTEAD of saving.
    const dialog = await screen.findByRole("dialog");
    expect(mocks.putInstanceDocument).not.toHaveBeenCalled();
    expect(dialog.textContent).toMatch(/every visitor/i);

    const confirm = screen.getByRole("button", { name: "Save and run it" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);

    // A wrong phrase keeps it blocked…
    const phrase = screen.getByLabelText(/Type “run this code” to confirm/);
    fireEvent.change(phrase, { target: { value: "run code" } });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(confirm);
    expect(mocks.putInstanceDocument).not.toHaveBeenCalled();

    // …the exact phrase unlocks the save.
    fireEvent.change(phrase, { target: { value: "run this code" } });
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.putInstanceDocument).toHaveBeenCalledTimes(1));
    expect(mocks.putInstanceDocument).toHaveBeenCalledWith("custom_js", "console.log(1)");
  });

  it("cancelling the confirmation saves nothing", async () => {
    render(
      <InstanceDocumentEditor name="custom_js" label="Custom JavaScript" code dangerConfirm />,
    );
    const field = await screen.findByLabelText("Custom JavaScript");
    fireEvent.change(field, { target: { value: "alert(1)" } });
    fireEvent.click(screen.getByRole("button", { name: "Save custom javascript" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.putInstanceDocument).not.toHaveBeenCalled();
  });

  it("clearing stored JS needs no phrase (removing code is safe)", async () => {
    mocks.getInstanceDocument.mockResolvedValue({ name: "custom_js", body: "x()", hash: "h" });
    render(
      <InstanceDocumentEditor name="custom_js" label="Custom JavaScript" code dangerConfirm />,
    );
    await screen.findByLabelText("Custom JavaScript");
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm clearing Custom JavaScript" }));
    await waitFor(() => expect(mocks.putInstanceDocument).toHaveBeenCalledWith("custom_js", ""));
  });
});
