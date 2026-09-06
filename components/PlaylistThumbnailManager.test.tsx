// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/components/auth/AuthProvider", () => ({ useSession: () => ({ status: "authed", user: { id: "owner" } }) }));
vi.mock("@/lib/api", async () => ({ ...await vi.importActual("@/lib/api"), api: { fetchPlaylistThumbnail: vi.fn().mockResolvedValue(new Blob(["image"])) } }));
import { PlaylistThumbnailManager } from "./PlaylistThumbnailManager";
afterEach(cleanup);
it("renders a private owner cover from authenticated bytes", async () => {
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:private-cover") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  render(<PlaylistThumbnailManager playlistId="private" hasThumbnail />);
  await waitFor(() => expect(screen.getByRole("img", { name: "Current cover" }).getAttribute("src")).toBe("blob:private-cover"));
});
