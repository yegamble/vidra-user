// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StorageMigration } from "@/lib/api";

const mocks = vi.hoisted(() => ({
  getStorageMigration: vi.fn(),
  previewStorageMigration: vi.fn(),
  startStorageMigration: vi.fn(),
  pauseStorageMigration: vi.fn(),
  resumeStorageMigration: vi.fn(),
  abortStorageMigration: vi.fn(),
  switchStorageMigrationAuthority: vi.fn(),
  releaseStorageMigrationSource: vi.fn(),
}));

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: { ...actual.api, ...mocks },
    errorMessage: (error: unknown) =>
      error instanceof Error ? error.message : "something went wrong",
  };
});

// The detail read is viewer-scoped, so the component goes through
// useSettledSession — which throws outside an AuthProvider on purpose. A
// SETTLED admin is what production gives it.
vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => ({ status: "authed", user: { id: "admin-1", role: "admin" } }),
}));

import { StorageMigrationControls } from "./StorageMigrationControls";

function campaign(over: Partial<StorageMigration> = {}): StorageMigration {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    state: "copying",
    source_desc: "local:/var/lib/vidra/media",
    target_desc: "s3://s3.example.test/vidra-media",
    objects_total: 1000,
    objects_done: 400,
    objects_failed: 0,
    last_error: "",
    created_at: "2026-09-09T10:00:00Z",
    updated_at: "2026-09-09T10:30:00Z",
    ...over,
  } as StorageMigration;
}

beforeEach(() => {
  mocks.getStorageMigration.mockResolvedValue(campaign());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("StorageMigrationControls", () => {
  it("previews before it starts, and creates nothing until the operator says so", async () => {
    mocks.previewStorageMigration.mockResolvedValue({
      dry_run: true,
      source_desc: "local:/var/lib/vidra/media",
      target_desc: "s3://s3.example.test/vidra-media",
      objects: 1272,
      bytes: 306211229,
      bytes_known: true,
    });
    render(<StorageMigrationControls campaign={null} onChanged={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /what would be copied/i }));
    await screen.findByText(/1,272 objects/);
    // The whole point of a dry run: nothing was created.
    expect(mocks.startStorageMigration).not.toHaveBeenCalled();
    // And both stores are named, because "which store to which" is the question.
    expect(
      screen.getByText(/local:\/var\/lib\/vidra\/media → s3:\/\/s3\.example\.test\/vidra-media/),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /start the migration/i }));
    expect(mocks.startStorageMigration).toHaveBeenCalledTimes(1);
  });

  it("says the byte total is unavailable rather than showing a zero", async () => {
    mocks.previewStorageMigration.mockResolvedValue({
      dry_run: true,
      source_desc: "s3://a/b",
      target_desc: "s3://c/d",
      objects: 40,
      bytes: 0,
      bytes_known: false,
    });
    render(<StorageMigrationControls campaign={null} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /what would be copied/i }));
    await screen.findByText(/40 objects/);
    expect(screen.getByText(/cannot report sizes cheaply/i)).toBeTruthy();
  });

  // THE PAUSE, and the sentence that matters most on it. A write-denied target
  // used to be a fatal boot refusal that took the whole instance down; the first
  // thing an operator must learn now is that their instance is fine.
  it("explains a target_write_denied pause as an instance that is still working", async () => {
    render(
      <StorageMigrationControls
        campaign={campaign({
          state: "paused",
          paused_reason: "target_write_denied",
          resume_state: "copying",
          last_error: "the migration target refused a write probe",
        })}
        onChanged={vi.fn()}
      />,
    );
    expect(screen.getByText(/This instance is otherwise unaffected/i)).toBeTruthy();
    expect(screen.getByText(/resumes on its own within five minutes/i)).toBeTruthy();
    // And it says where a resume lands, which is the difference between more
    // copying and a campaign that is ready to cut over.
    expect(screen.getByText(/Resuming returns it to/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Resume$/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Pause$/ })).toBeNull();
  });

  it("pauses and resumes through the API", async () => {
    const onChanged = vi.fn();
    mocks.pauseStorageMigration.mockResolvedValue(
      campaign({ state: "paused", paused_reason: "operator", resume_state: "copying" }),
    );
    render(<StorageMigrationControls campaign={campaign()} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole("button", { name: /^Pause$/ }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(mocks.pauseStorageMigration).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
    );
  });

  // THE TYPED CONFIRM. This is the only thing in the product that deletes from
  // the destination, asked for on the way OUT of a destructive operation.
  it("will not clear the destination until PURGE is typed", async () => {
    mocks.abortStorageMigration.mockResolvedValue(campaign({ state: "aborting" }));
    render(<StorageMigrationControls campaign={campaign()} onChanged={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /abort and clear the destination/i }));
    const confirmButton = screen.getByRole("button", { name: /confirm abort and clear/i });
    expect((confirmButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/type PURGE to confirm/i), {
      target: { value: "purge" },
    });
    expect((confirmButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/type PURGE to confirm/i), {
      target: { value: "PURGE" },
    });
    expect((confirmButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(confirmButton);
    await waitFor(() =>
      expect(mocks.abortStorageMigration).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
        { cleanDestination: true, confirm: "PURGE" },
      ),
    );
  });

  it("aborts without touching the destination when the plain button is used", async () => {
    mocks.abortStorageMigration.mockResolvedValue(campaign({ state: "cancelled" }));
    render(<StorageMigrationControls campaign={campaign()} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Abort$/ }));
    await waitFor(() =>
      expect(mocks.abortStorageMigration).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
      ),
    );
  });

  // Cleaning the destination AFTER cutover would empty the live library. Core
  // refuses it; the button is not offered either, so the refusal is never the
  // first an operator hears of it.
  it("does not offer the destination clean-up after cutover", () => {
    render(
      <StorageMigrationControls
        campaign={campaign({ state: "cutover" })}
        onChanged={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /abort and clear the destination/i }),
    ).toBeNull();
  });

  // THE TWO STEPS. Release is the act that makes the move irreversible and must
  // never be reachable straight off a synced campaign.
  it("keeps the authority switch and the release as two separate steps", async () => {
    mocks.switchStorageMigrationAuthority.mockResolvedValue(campaign({ state: "cutover" }));
    const { rerender } = render(
      <StorageMigrationControls
        campaign={campaign({ state: "synced" })}
        onChanged={vi.fn()}
      />,
    );
    const release = screen.getByRole("button", { name: /release the old store/i });
    expect((release as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /record the cutover/i }));
    await waitFor(() => expect(mocks.switchStorageMigrationAuthority).toHaveBeenCalled());
    expect(mocks.releaseStorageMigrationSource).not.toHaveBeenCalled();

    rerender(
      <StorageMigrationControls
        campaign={campaign({ state: "cutover" })}
        onChanged={vi.fn()}
      />,
    );
    const armed = screen.getByRole("button", { name: /release the old store/i });
    expect((armed as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(armed);
    await waitFor(() => expect(mocks.releaseStorageMigrationSource).toHaveBeenCalled());
  });

  it("cannot record a cutover from a phase core would refuse", () => {
    render(
      <StorageMigrationControls
        campaign={campaign({ state: "enumerating" })}
        onChanged={vi.fn()}
      />,
    );
    const button = screen.getByRole("button", { name: /record the cutover/i });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  // THE FAILURE TABLE, and the column that did not exist. objects_failed counts
  // only spent budgets, so a campaign every object of which is being refused
  // reported zero and said nothing for as long as the ladder took.
  it("shows retrying objects while objects_failed is still zero", async () => {
    mocks.getStorageMigration.mockResolvedValue(
      campaign({
        objects_failed: 0,
        failures: [
          { category: "copy failed; retrying", terminal: 0, retrying: 54 },
          { category: "source object missing", terminal: 2, retrying: 0 },
        ],
      }),
    );
    render(<StorageMigrationControls campaign={campaign()} onChanged={vi.fn()} />);

    await screen.findByText("copy failed; retrying");
    expect(screen.getByText("54")).toBeTruthy();
    expect(screen.getByText("source object missing")).toBeTruthy();
    // The campaign-level counter really is zero — that is the finding, and the
    // table is what makes the stall legible anyway.
    expect(screen.queryByText(/dead-lettered/i)).toBeNull();
  });

  it("renders a typed refusal from core instead of swallowing it", async () => {
    mocks.pauseStorageMigration.mockRejectedValue(
      new Error("this migration is cutover, so that is not something that can be done to it now"),
    );
    render(<StorageMigrationControls campaign={campaign()} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Pause$/ }));
    await screen.findByText(/this migration is cutover/i);
  });

  it("shows no controls on a finished campaign", () => {
    render(
      <StorageMigrationControls
        campaign={campaign({ state: "done", objects_done: 1000 })}
        onChanged={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /^Pause$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Abort$/ })).toBeNull();
    expect(screen.getByText(/Finished/)).toBeTruthy();
  });
});
