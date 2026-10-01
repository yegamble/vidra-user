// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getInstanceDocument: vi.fn(),
  putInstanceDocument: vi.fn(),
  reloadUser: vi.fn(),
  // Who is viewing: the owner by default so the pre-existing custom-JS cases
  // keep exercising the owner path; the owner-gating suite flips it.
  session: { user: { id: "u1", role: "admin", is_owner: true } } as {
    user: Record<string, unknown> | null;
  },
}));

vi.mock("@/components/auth/AuthProvider", () => ({
  useOptionalSession: () => ({ ...mocks.session, reloadUser: mocks.reloadUser }),
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
  mocks.session = { user: { id: "u1", role: "admin", is_owner: true } };
  mocks.reloadUser.mockResolvedValue(undefined);
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

// core #281: a NON-EMPTY custom_js/custom_css write is owner-only (403
// `owner_only`); clearing stays open to every admin. The editor mirrors that so
// a plain admin is not handed a Save that can only fail.
describe("InstanceDocumentEditor (owner-only custom code)", () => {
  const NOTE = "Only the instance owner can publish custom code. You can still clear it.";
  const cases = [
    { name: "custom_js", label: "Custom JavaScript", dangerConfirm: true },
    { name: "custom_css", label: "Custom CSS", dangerConfirm: false },
  ] as const;

  for (const c of cases) {
    const renderEditor = () =>
      render(
        <InstanceDocumentEditor
          name={c.name}
          label={c.label}
          code
          dangerConfirm={c.dangerConfirm}
        />,
      );

    it(`${c.name}: a non-owner sees Save disabled, the explanation, and Clear enabled`, async () => {
      mocks.session = { user: { id: "a2", role: "admin", is_owner: false } };
      mocks.getInstanceDocument.mockResolvedValue(doc("body{}"));
      renderEditor();
      const field = await screen.findByLabelText(c.label);

      expect(screen.getByText(NOTE)).toBeTruthy();
      fireEvent.change(field, { target: { value: "body{color:red}" } });
      const save = screen.getByRole("button", { name: `Save ${c.label.toLowerCase()}` });
      expect((save as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByRole("button", { name: "Clear" }) as HTMLButtonElement).disabled).toBe(
        false,
      );
    });

    it(`${c.name}: a non-owner can still clear via an empty-body PUT`, async () => {
      mocks.session = { user: { id: "a2", role: "admin", is_owner: false } };
      mocks.getInstanceDocument.mockResolvedValue(doc("body{}"));
      renderEditor();
      await screen.findByLabelText(c.label);
      fireEvent.click(screen.getByRole("button", { name: "Clear" }));
      fireEvent.click(screen.getByRole("button", { name: `Confirm clearing ${c.label}` }));
      await waitFor(() => expect(mocks.putInstanceDocument).toHaveBeenCalledWith(c.name, ""));
    });

    it(`${c.name}: the owner has Save enabled and no explanation`, async () => {
      renderEditor();
      const field = await screen.findByLabelText(c.label);
      fireEvent.change(field, { target: { value: "x" } });
      expect(
        (
          screen.getByRole("button", {
            name: `Save ${c.label.toLowerCase()}`,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false);
      expect(screen.queryByText(NOTE)).toBeNull();
    });

    it(`${c.name}: a 403 owner_only (stale ownership) renders the specific message`, async () => {
      const { ApiError } = await import("@/lib/api");
      mocks.putInstanceDocument.mockRejectedValue(
        new ApiError({ status: 403, code: "owner_only", message: "forbidden" }),
      );
      renderEditor();
      const field = await screen.findByLabelText(c.label);
      fireEvent.change(field, { target: { value: "x" } });
      fireEvent.click(screen.getByRole("button", { name: `Save ${c.label.toLowerCase()}` }));
      if (c.dangerConfirm) {
        fireEvent.change(await screen.findByLabelText(/to confirm/), {
          target: { value: "run this code" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Save and run it" }));
      }
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("Only the instance owner can publish custom code");
      expect(alert.textContent).not.toContain("Could not save");
      // The cached session said owner; ownership moved — refresh it.
      await waitFor(() => expect(mocks.reloadUser).toHaveBeenCalled());
    });
  }

  it("homepage is unaffected for a non-owner", async () => {
    mocks.session = { user: { id: "a2", role: "admin", is_owner: false } };
    render(<InstanceDocumentEditor name="homepage" label="Homepage content" markdown />);
    const field = await screen.findByLabelText("Homepage content");
    fireEvent.change(field, { target: { value: "# Hi" } });
    expect(screen.queryByText(NOTE)).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Save homepage content" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});
