// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { navigation } from "@/lib/test-navigation";

import { FeedMoreSorts } from "./FeedMoreSorts";

vi.mock("next/navigation", async () => (await import("@/lib/test-navigation")).navigationMock);

beforeEach(() => navigation.reset("/"));
afterEach(cleanup);

describe("FeedMoreSorts", () => {
  it("rests on the placeholder while a tab mode is active", () => {
    render(<FeedMoreSorts active="recent" />);
    const select = screen.getByRole("combobox", { name: "More sort orders" }) as HTMLSelectElement;
    expect(select.value).toBe("");
  });

  it("pushes the pick into the URL and keeps the active filters", () => {
    render(<FeedMoreSorts active="recent" filters={{ category: "music", tag: "live" }} />);
    fireEvent.change(screen.getByRole("combobox", { name: "More sort orders" }), {
      target: { value: "originally_published_at" },
    });
    expect(navigation.pushed).toEqual(["/?sort=originally_published_at&category=music&tag=live"]);
  });

  it("shows its own mode when active and does not re-push it", () => {
    render(<FeedMoreSorts active="name" />);
    const select = screen.getByRole("combobox", { name: "More sort orders" }) as HTMLSelectElement;
    expect(select.value).toBe("name");
    fireEvent.change(select, { target: { value: "name" } });
    expect(navigation.pushed).toEqual([]);
  });
});
