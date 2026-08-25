// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminTable, type AdminTableColumn, type AdminTableProps } from "./AdminTable";

afterEach(cleanup);

type Run = { id: string; state: string; attempt: number };

const runs: Run[] = [
  { id: "run-1", state: "running", attempt: 1 },
  { id: "run-2", state: "failed", attempt: 3 },
];

const columns: AdminTableColumn<Run>[] = [
  { key: "id", header: "Execution", cell: (run) => run.id },
  { key: "state", header: "State", cell: (run) => run.state },
  { key: "attempt", header: "Attempt", align: "end", cell: (run) => run.attempt },
  {
    key: "actions",
    header: "Details",
    srOnlyHeader: true,
    align: "end",
    cell: (run) => <button type="button">{`Open ${run.id}`}</button>,
  },
];

function table(props: Partial<AdminTableProps<Run>> = {}) {
  return (
    <AdminTable
      label="Job executions"
      columns={columns}
      rows={runs}
      rowKey={(run) => run.id}
      {...props}
    />
  );
}

describe("AdminTable", () => {
  it("renders declared columns as a named table", () => {
    render(table());
    const grid = screen.getByRole("table", { name: "Job executions" });
    expect(grid).toBeTruthy();
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "Execution",
      "State",
      "Attempt",
      "Details",
    ]);
    // Two data rows plus the header row.
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Open run-2" })).toBeTruthy();
  });

  it("keeps an action column's header for screen readers only", () => {
    render(table());
    const headers = screen.getAllByRole("columnheader");
    expect(headers[3].querySelector(".sr-only")?.textContent).toBe("Details");
  });

  it("shows a spinner while loading and no table", () => {
    render(table({ status: "loading" }));
    expect(screen.getByRole("status", { name: "Loading Job executions" })).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows the shared error state with a retry", () => {
    const onRetry = vi.fn();
    render(table({ status: "error", errorMessage: "Could not load executions.", onRetry }));
    expect(screen.getByRole("alert").textContent).toContain("Could not load executions.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("falls back to a default empty state for zero rows", () => {
    render(table({ rows: [] }));
    expect(screen.getByText("No job executions")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("keeps the footer on an empty page so an overshot offset can be paged back", () => {
    render(table({ rows: [], footer: <button type="button">Previous</button> }));
    expect(screen.getByRole("button", { name: "Previous" })).toBeTruthy();
  });

  it("applies minWidth as an inline style, not an uncompilable arbitrary class", () => {
    render(table({ minWidth: "68rem" }));
    const grid = screen.getByRole("table", { name: "Job executions" }) as HTMLTableElement;
    expect(grid.style.minWidth).toBe("68rem");
  });

  it("lets a row opt into extra classes", () => {
    render(table({ rowClassName: (run) => (run.state === "failed" ? "opacity-60" : undefined) }));
    const rows = screen.getAllByRole("row");
    expect(rows[2].className).toContain("opacity-60");
    expect(rows[1].className).toBe("");
  });
});
