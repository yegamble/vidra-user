// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  errorMessage: (err: unknown, fallback: string) =>
    err instanceof Error && err.message ? err.message : fallback,
}));

import { ManagedList, UndoActionRow } from "./ManagedList";
import { EmptyState } from "./ui/EmptyState";

type Row = { id: string; name: string };

const ROWS: Row[] = [
  { id: "1", name: "ada" },
  { id: "2", name: "grace" },
];

function List({
  load,
  perform = async () => {},
}: {
  load: (signal: AbortSignal) => Promise<Row[]>;
  perform?: () => Promise<unknown>;
}) {
  return (
    <ManagedList<Row>
      load={load}
      rowKey={(row) => row.id}
      loadingLabel="Loading rows"
      errorText="Could not load rows."
      empty={<EmptyState title="Nothing here" />}
      renderRow={(row, remove) => (
        <UndoActionRow
          title={row.name}
          subtitle={`@${row.name}`}
          action="Undo"
          actionLabel={`Undo ${row.name}`}
          perform={perform}
          failureText="Could not undo."
          onDone={remove}
        />
      )}
    />
  );
}

afterEach(cleanup);

describe("ManagedList", () => {
  it("shows the spinner while loading", () => {
    render(<List load={() => new Promise<Row[]>(() => {})} />);
    expect(screen.getByLabelText("Loading rows")).toBeTruthy();
  });

  it("renders a row per item once loaded", async () => {
    render(<List load={async () => ROWS} />);
    expect(await screen.findByText("ada")).toBeTruthy();
    expect(screen.getByText("grace")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("shows the empty state for a list with no rows", async () => {
    render(<List load={async () => []} />);
    expect(await screen.findByText("Nothing here")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("shows the error state and retries on request", async () => {
    const load = vi
      .fn<(s: AbortSignal) => Promise<Row[]>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(ROWS);
    render(<List load={load} />);

    expect(await screen.findByText("Could not load rows.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("ada")).toBeTruthy();
  });

  it("drops the row optimistically once its action succeeds", async () => {
    render(<List load={async () => ROWS} />);
    await screen.findByText("ada");

    fireEvent.click(screen.getByRole("button", { name: "Undo ada" }));
    await waitFor(() => expect(screen.queryByText("ada")).toBeNull());
    // Only the acted-on row goes.
    expect(screen.getByText("grace")).toBeTruthy();
  });

  // A failed undo must leave the row where it is, with the reason attached —
  // silently removing a row whose server-side removal failed would lie.
  it("keeps the row and reports inline when the action fails", async () => {
    render(
      <List
        load={async () => ROWS}
        perform={async () => {
          throw new Error("Nope.");
        }}
      />,
    );
    await screen.findByText("ada");

    fireEvent.click(screen.getByRole("button", { name: "Undo ada" }));
    expect(await screen.findByText("Nope.")).toBeTruthy();
    expect(screen.getByText("ada")).toBeTruthy();
  });

  it("blocks a re-entrant second click while the action is in flight", async () => {
    const perform = vi.fn(() => new Promise<void>(() => {}));
    render(<List load={async () => ROWS} perform={perform} />);
    await screen.findByText("ada");

    const button = screen.getByRole("button", { name: "Undo ada" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(perform).toHaveBeenCalledTimes(1);
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});
