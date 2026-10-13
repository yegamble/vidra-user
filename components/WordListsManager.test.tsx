// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const admin = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }));
const mine = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }));

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {
    status = 0;
  },
  adminWatchedWordLists: admin,
  myWatchedWordLists: mine,
  errorMessage: (_error: unknown, fallback: string) => fallback,
}));

import { WordListsManager, parseWords } from "@/components/WordListsManager";

function wl(id: string, name: string, over: Partial<Record<string, unknown>> = {}) {
  return {
    id,
    name,
    action: "flag",
    is_default: false,
    word_count: 2,
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-01T10:00:00Z",
    ...over,
  };
}

beforeEach(() => {
  for (const m of [...Object.values(admin), ...Object.values(mine)]) m.mockReset();
});
afterEach(cleanup);

describe("parseWords", () => {
  it("splits on lines, trims and drops blanks", () => {
    expect(parseWords(" spam \r\n\n scam phrase\n")).toEqual(["spam", "scam phrase"]);
  });
});

describe("WordListsManager", () => {
  it("lists a creator's own lists through the account endpoints, never the admin ones", async () => {
    mine.list.mockResolvedValue({ lists: [wl("l1", "Slurs", { action: "hold" })], total: 1, limit: 20, offset: 0 });
    render(<WordListsManager scope="me" />);
    expect(await screen.findByText("Slurs")).toBeTruthy();
    expect(screen.getByText("Hold for approval", { selector: "span" })).toBeTruthy();
    expect(admin.list).not.toHaveBeenCalled();
  });

  it("creates a list with the chosen action and the parsed words, and shows it", async () => {
    mine.list.mockResolvedValue({ lists: [], total: 0, limit: 20, offset: 0 });
    mine.create.mockResolvedValue(wl("l2", "Spoilers", { action: "hold", word_count: 2 }));
    render(<WordListsManager scope="me" />);
    await screen.findByText("No word lists yet.");
    fireEvent.change(screen.getByLabelText("New list name"), { target: { value: " Spoilers " } });
    fireEvent.change(screen.getByLabelText("When a comment matches"), { target: { value: "hold" } });
    fireEvent.change(screen.getByLabelText("Words for the new list"), { target: { value: "finale\n\nthe twist" } });
    fireEvent.click(screen.getByRole("button", { name: "Create list" }));
    await waitFor(() =>
      expect(mine.create).toHaveBeenCalledWith({ name: "Spoilers", action: "hold", words: ["finale", "the twist"] }),
    );
    expect(await screen.findByText("Spoilers")).toBeTruthy();
  });

  it("edits a list: loads its words on open and saves the replaced set", async () => {
    admin.list.mockResolvedValue({ lists: [wl("l1", "Hate")], total: 1, limit: 20, offset: 0 });
    admin.get.mockResolvedValue({ ...wl("l1", "Hate"), words: ["one", "two"] });
    admin.update.mockResolvedValue(wl("l1", "Hate", { action: "hold", word_count: 3 }));
    render(<WordListsManager scope="admin" />);
    await screen.findByText("Hate");
    fireEvent.click(screen.getByRole("button", { name: "Edit list Hate" }));
    const words = (await screen.findByLabelText("Words in this list")) as HTMLTextAreaElement;
    await waitFor(() => expect(words.value).toBe("one\ntwo"));
    fireEvent.change(words, { target: { value: "one\ntwo\nthree" } });
    fireEvent.change(screen.getByLabelText("Action on a match"), { target: { value: "hold" } });
    fireEvent.click(screen.getByRole("button", { name: "Save list" }));
    await waitFor(() =>
      expect(admin.update).toHaveBeenCalledWith("l1", { name: "Hate", action: "hold", words: ["one", "two", "three"] }),
    );
    expect(await screen.findByText("Hold for approval", { selector: "span" })).toBeTruthy();
  });

  it("never sends words for, nor offers deleting, the default list", async () => {
    admin.list.mockResolvedValue({ lists: [wl("d", "Default", { is_default: true, word_count: 40 })], total: 1, limit: 20, offset: 0 });
    admin.update.mockResolvedValue(wl("d", "Default", { is_default: true, action: "hold" }));
    render(<WordListsManager scope="admin" />);
    await screen.findByText("Default", { selector: "p" });
    fireEvent.click(screen.getByRole("button", { name: "Edit list Default" }));
    expect(screen.queryByLabelText("Words in this list")).toBeNull();
    expect(screen.queryByRole("button", { name: /Delete list/ })).toBeNull();
    expect(admin.get).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Action on a match"), { target: { value: "hold" } });
    fireEvent.click(screen.getByRole("button", { name: "Save list" }));
    await waitFor(() => expect(admin.update).toHaveBeenCalledWith("d", { name: "Default", action: "hold" }));
  });

  it("deletes a list and drops its row", async () => {
    mine.list.mockResolvedValue({ lists: [wl("l1", "Gone")], total: 1, limit: 20, offset: 0 });
    mine.get.mockResolvedValue({ ...wl("l1", "Gone"), words: [] });
    mine.remove.mockResolvedValue(undefined);
    render(<WordListsManager scope="me" />);
    await screen.findByText("Gone");
    fireEvent.click(screen.getByRole("button", { name: "Edit list Gone" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete list Gone" }));
    await waitFor(() => expect(mine.remove).toHaveBeenCalledWith("l1"));
    await waitFor(() => expect(screen.queryByText("Gone")).toBeNull());
  });
});
