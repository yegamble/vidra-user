import { beforeEach, expect, it, vi } from "vitest";
import { apiRequest } from "./client";
import { sitePages } from "./site-pages";

vi.mock("./client", () => ({ apiRequest: vi.fn() }));
beforeEach(() => vi.mocked(apiRequest).mockClear());

it("submits the expected revision on an edit and delete", async () => {
  const draft = { title: "Privacy", body: "Text", in_menu: true, menu_order: 3, revision: "current" };
  await sitePages.save("privacy", draft);
  expect(apiRequest).toHaveBeenCalledWith("/api/v1/admin/pages/privacy", { method: "PUT", body: draft });
  await sitePages.remove("privacy", "current");
  expect(apiRequest).toHaveBeenCalledWith("/api/v1/admin/pages/privacy", { method: "DELETE", query: { revision: "current" } });
});
