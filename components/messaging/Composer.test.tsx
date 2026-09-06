// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "@/lib/api";
import { Composer } from "./Composer";

vi.mock("@/lib/api", async (original) => ({
  ...await original<typeof import("@/lib/api")>(),
  api: { uploadDMAttachment: vi.fn() },
}));
const upload = vi.mocked(api.uploadDMAttachment);
const officeTypes = [
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
function file(name: string, size = 1, type = "application/pdf") {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}
function setup() {
  const onSend = vi.fn();
  const { container } = render(<Composer conversationId="conversation" onSend={onSend} />);
  const input = container.querySelector('input[type="file"]')!;
  return { onSend, input, choose: (files: File[]) => fireEvent.change(input, { target: { files } }) };
}
beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  upload.mockImplementation(async (_id, f) => ({ attachment_id: f.name, kind: "pdf", content_type: f.type, filename: f.name, size_bytes: f.size }));
});
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllGlobals(); });

describe("Composer attachment contract", () => {
  it("sends all 30 attachments, including the exact 100 MiB boundary", async () => {
    const { choose, onSend } = setup();
    const files = Array.from({ length: 30 }, (_, i) => file(`${i}.pdf`, i === 0 ? 100 * 1024 * 1024 : 1));
    choose(files);
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(30));
    await waitFor(() => expect((screen.getByRole("button", { name: "Send message" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(onSend).toHaveBeenCalledWith("", files.map(f => f.name));
  });

  it("refuses an overflowing selection visibly without silently dropping files", () => {
    const { choose } = setup();
    choose(Array.from({ length: 31 }, (_, i) => file(`${i}.pdf`)));
    expect(screen.getByRole("alert").textContent).toContain("at most 30");
    expect(upload).not.toHaveBeenCalled();
  });

  it("counts existing pending attachments when refusing an extra selection", async () => {
    const { choose } = setup();
    choose(Array.from({ length: 29 }, (_, i) => file(`${i}.pdf`)));
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(29));
    choose([file("extra.pdf"), file("overflow.pdf")]);
    expect(screen.getByRole("alert").textContent).toContain("at most 30");
    expect(upload).toHaveBeenCalledTimes(29);
  });

  it.each(officeTypes)("uploads and exposes %s in the picker", async type => {
    const { choose, input } = setup();
    expect(input.getAttribute("accept")).toContain(type);
    choose([file("office", 1, type)]);
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
  });

  it("rejects 100 MiB plus one byte and unsupported types before upload", () => {
    const { choose } = setup();
    choose([file("large.pdf", 100 * 1024 * 1024 + 1)]);
    expect(screen.getByRole("alert").textContent).toContain("100 MiB");
    choose([file("program.exe", 1, "application/x-msdownload")]);
    expect(screen.getByRole("alert").textContent).toContain("isn't supported");
    expect(upload).not.toHaveBeenCalled();
  });

  it.each([[413, "Too large (max 100 MiB)."], [415, "Unsupported type."], [422, "Couldn't be attached."], [503, "Attachments unavailable."]] as const)("preserves server %s failure and supports explicit retry", async (status, message) => {
    upload.mockRejectedValueOnce(new ApiError({ status, message, code: "upload_failed" }));
    const { choose, onSend } = setup(); choose([file("retry.pdf")]);
    expect(await screen.findByText(message)).toBeTruthy();
    expect(onSend).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Send message" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Send message" }) as HTMLButtonElement).disabled).toBe(false));
    expect(upload).toHaveBeenCalledTimes(2);
  });
});
