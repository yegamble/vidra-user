// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WatchedWordMatch } from "@/lib/api";

import {
  WatchedWordMatchesView,
  splitSnapshot,
} from "./WatchedWordMatchesView";

const mocks = vi.hoisted(() => ({
  getWatchedWordMatches: vi.fn(),
  resolveWatchedWordMatch: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getWatchedWordMatches: mocks.getWatchedWordMatches,
    resolveWatchedWordMatch: mocks.resolveWatchedWordMatch,
  },
  errorMessage: (_error: unknown, fallback: string) => fallback,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, push: () => {} }),
  usePathname: () => "/moderation/watched-word-matches",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => ({
    user: { id: "mod-1", username: "dana", role: "moderator" },
  }),
}));

// A comment flagged for "pineapple" whose author has since edited the term away:
// the snapshot still carries the flagged words, the LIVE body does not.
const EDITED_AWAY: WatchedWordMatch = {
  id: "m-1",
  word: "pineapple",
  type: "comment",
  comment_id: "c-1",
  comment_body: "never mind, plain cheese",
  video_id: "v-1",
  video_title: "Control Clip",
  author_username: "cleo",
  created_at: "2026-09-06T12:00:00Z",
  matched_text: "I want pineapple on it",
  match_offset: 7,
  match_length: 9,
  snapshot_backfilled: false,
  term_active: true,
  target_status: "edited_away",
  status: "open",
  moderator_note: "",
} as WatchedWordMatch;

function page(matches: WatchedWordMatch[]) {
  return { matches, total: matches.length, limit: 20, offset: 0 };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getWatchedWordMatches.mockResolvedValue(page([EDITED_AWAY]));
  mocks.resolveWatchedWordMatch.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe("splitSnapshot", () => {
  it("slices at the reported rune offset", () => {
    expect(splitSnapshot("I want pineapple on it", 7, 9, "pineapple")).toEqual([
      "I want ",
      "pineapple",
      " on it",
    ]);
  });

  it("counts runes, not UTF-16 code units, so an astral character does not shift the span", () => {
    // U+2070E is ONE rune and TWO UTF-16 units. A naive string slice at the
    // backend's rune offset of 2 would cut the surrogate pair in half and
    // highlight the wrong span. (Written as an escape so the source file stays
    // plain ASCII and the icon lint has nothing to argue with.)
    const astral = String.fromCodePoint(0x2070e);
    const text = `${astral} pineapple`;
    expect(splitSnapshot(text, 2, 9, "pineapple")).toEqual([
      `${astral} `,
      "pineapple",
      "",
    ]);
  });

  it("falls back to a case-insensitive search when the offset is unknown (-1)", () => {
    // Every row backfilled by migration 0132 carries -1: the flag-time text is
    // gone, so no offset can honestly be claimed.
    expect(splitSnapshot("Buy my MIXTAPE now", -1, 0, "mixtape")).toEqual([
      "Buy my ",
      "MIXTAPE",
      " now",
    ]);
  });

  it("survives a missing snapshot instead of taking the queue down with it", () => {
    // `matched_text` is contract-required, but a frontend deployed ahead of a
    // core that predates 0132 would hand this undefined, and Array.from would
    // throw through the error boundary.
    expect(
      splitSnapshot(undefined as unknown as string, -1, 0, "spam"),
    ).toEqual(["", "", ""]);
  });

  it("highlights nothing rather than the wrong span when the term is absent", () => {
    expect(splitSnapshot("nothing to see", -1, 0, "pineapple")).toEqual([
      "nothing to see",
      "",
      "",
    ]);
  });
});

describe("WatchedWordMatchesView", () => {
  it("quotes the flag-time snapshot, not the live body, and says the two differ", async () => {
    render(<WatchedWordMatchesView />);
    // The snapshot is what a moderator reviews. Before this slice the queue
    // read the live body through a join and rendered "never mind, plain
    // cheese" under a "pineapple" flag.
    expect(await screen.findByText(/I want/)).toBeTruthy();
    expect(screen.getByText("pineapple", { selector: "mark" })).toBeTruthy();
    expect(screen.queryByText(/never mind, plain cheese/)).toBeNull();
    expect(
      screen.getByText(/The live comment no longer contains this term/),
    ).toBeTruthy();
  });

  it("asks the server for OPEN matches by default", async () => {
    render(<WatchedWordMatchesView />);
    await waitFor(() => expect(mocks.getWatchedWordMatches).toHaveBeenCalled());
    expect(mocks.getWatchedWordMatches.mock.calls[0][0]).toMatchObject({
      status: "open",
    });
  });

  it("filters on the SERVER when a chip is picked, not by narrowing the page it holds", async () => {
    // The filter lives in the URL (useListQuery), so the observable effect of a
    // chip is the query-string patch that the next fetch reads. Narrowing the
    // already-fetched page with Array.filter would mean "Dismissed" showed the
    // dismissed ones AMONG the first twenty open ones — i.e. none.
    render(<WatchedWordMatchesView />);
    await screen.findByText(/I want/);
    fireEvent.click(screen.getByRole("button", { name: "Dismissed" }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalled());
    const target = String(mocks.replace.mock.calls.at(-1)?.[0] ?? "");
    expect(target).toContain("status=dismissed");
  });

  it("resolves a match with the moderator's note and removes it from the open queue", async () => {
    render(<WatchedWordMatchesView />);
    await screen.findByText(/I want/);
    fireEvent.change(screen.getByLabelText("Internal moderator note"), {
      target: { value: "removed the comment" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
    await waitFor(() =>
      expect(mocks.resolveWatchedWordMatch).toHaveBeenCalledWith("m-1", {
        status: "resolved",
        note: "removed the comment",
      }),
    );
    // The server applies the status filter, so a resolved row is no longer one
    // of the open ones — it leaves the page and the total together.
    await waitFor(() => expect(screen.queryByText(/I want/)).toBeNull());
  });

  it("dismisses without a note, sending no empty string", async () => {
    render(<WatchedWordMatchesView />);
    await screen.findByText(/I want/);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() =>
      expect(mocks.resolveWatchedWordMatch).toHaveBeenCalledWith("m-1", {
        status: "dismissed",
        note: undefined,
      }),
    );
  });

  it("keeps the row and reports a failed triage instead of pretending it worked", async () => {
    mocks.resolveWatchedWordMatch.mockRejectedValueOnce(new Error("nope"));
    render(<WatchedWordMatchesView />);
    await screen.findByText(/I want/);
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
    expect(
      await screen.findByText("Could not update this flagged item."),
    ).toBeTruthy();
    expect(screen.getByText(/I want/)).toBeTruthy();
  });

  it("marks a backfilled snapshot so it is not read as evidence of what was flagged", async () => {
    mocks.getWatchedWordMatches.mockResolvedValue(
      page([
        {
          ...EDITED_AWAY,
          id: "m-2",
          snapshot_backfilled: true,
          match_offset: -1,
        },
      ]),
    );
    render(<WatchedWordMatchesView />);
    expect(
      await screen.findByText(/Reconstructed from the live comment/),
    ).toBeTruthy();
  });

  it("says a term is gone rather than dropping the match with it", async () => {
    mocks.getWatchedWordMatches.mockResolvedValue(
      page([{ ...EDITED_AWAY, id: "m-3", term_active: false }]),
    );
    render(<WatchedWordMatchesView />);
    expect(await screen.findByText("Term removed")).toBeTruthy();
    // The term itself still reads back, from the snapshot.
    expect(screen.getAllByText("pineapple").length).toBeGreaterThan(0);
  });

  it("shows a triaged row's outcome, note and who acted, with no action buttons", async () => {
    mocks.getWatchedWordMatches.mockResolvedValue(
      page([
        {
          ...EDITED_AWAY,
          id: "m-4",
          status: "dismissed",
          moderator_note: "on reflection, fine",
          resolved_by_username: "dana",
          resolved_at: "2026-09-06T13:00:00Z",
        } as WatchedWordMatch,
      ]),
    );
    render(<WatchedWordMatchesView />);
    expect(await screen.findByText(/on reflection, fine/)).toBeTruthy();
    expect(screen.getByText(/Dismissed by dana/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Resolve" })).toBeNull();
    expect(screen.queryByLabelText("Internal moderator note")).toBeNull();
  });

  it("does not show a same-body notice when the live target still holds the term", async () => {
    mocks.getWatchedWordMatches.mockResolvedValue(
      page([{ ...EDITED_AWAY, id: "m-5", target_status: "present" }]),
    );
    render(<WatchedWordMatchesView />);
    await screen.findByText(/I want/);
    expect(screen.queryByText(/no longer contains this term/)).toBeNull();
  });
});
