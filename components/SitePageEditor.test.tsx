// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { sitePages } from "@/lib/api/site-pages";
import { ApiError } from "@/lib/api/client";
import { SitePageEditor } from "./SitePageEditor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/api/site-pages", () => ({ sitePages: { save: vi.fn(), remove: vi.fn() } }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("retains the draft when another administrator edited the same revision", async () => {
  const original = { slug: "privacy", title: "Privacy", body: "Original", menu_label: "", in_menu: true, menu_order: 1, revision: "initial" };
  vi.mocked(sitePages.save).mockRejectedValue(new ApiError({ status: 409, code: "conflict", message: "conflict" }));
  render(<SitePageEditor page={original} />);
  fireEvent.change(screen.getByLabelText("Page content (Markdown)"), { target: { value: "My edit" } });
  fireEvent.click(screen.getByRole("button", { name: "Save page" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("reload"));
  expect(sitePages.save).toHaveBeenCalledWith("privacy", expect.objectContaining({ body: "My edit", revision: "initial" }));
  expect((screen.getByLabelText("Page content (Markdown)") as HTMLTextAreaElement).value).toBe("My edit");
});
