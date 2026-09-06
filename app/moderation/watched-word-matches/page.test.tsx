// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import WatchedWordMatchesPage from "./page";

// The view fetches; this test is about the sentence above it.
vi.mock("@/components/WatchedWordMatchesView", () => ({
  WatchedWordMatchesView: () => null,
}));

// The queue held only comments when it shipped (0030). Migration 0049 added
// VIDEO matches — the flagging runs on a video's title+description at create
// AND edit, and the view badges each row "Comment" or "Video" — but the page's
// own description still said "Comments flagged … when they were posted". A
// moderator reading it would not know a video match can appear at all, or that
// an edit can raise one. It also left the most consequential fact unsaid:
// flagging RECORDS a match, it never hides the content (unlike quarantine),
// so a moderator who sees a row must still act on it themselves.
describe("Word matches page description", () => {
  it("names videos as well as comments, edits as well as posts, and says flagging does not hide", () => {
    render(<WatchedWordMatchesPage />);
    const description = screen.getByText(/flagged by the watched-words list/i).textContent ?? "";
    expect(description).toMatch(/comments and videos/i);
    expect(description).toMatch(/edited/i);
    expect(description).toMatch(/does not hide/i);
    expect(description).not.toMatch(/^Comments flagged by the watched-words list when they were posted/);
  });
});
