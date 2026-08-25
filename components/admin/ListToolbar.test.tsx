// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminSearch } from "./AdminControls";
import { ListSearch, ListToolbar } from "./ListToolbar";

afterEach(cleanup);

const sortOptions = [
  { value: "-created_at", label: "Newest first" },
  { value: "created_at", label: "Oldest first" },
] as const;

function search() {
  return (
    <AdminSearch
      label="Search users"
      placeholder="Search"
      value=""
      onChange={() => {}}
      onSubmit={() => {}}
      onClear={() => {}}
      hasQuery={false}
    />
  );
}

describe("ListToolbar", () => {
  it("hosts the existing AdminSearch untouched", () => {
    render(<ListToolbar search={search()} />);
    expect(screen.getByRole("search")).toBeTruthy();
    expect(screen.getByLabelText("Search users")).toBeTruthy();
  });

  it("renders a labelled sort picker and reports the chosen key", () => {
    const onChange = vi.fn();
    render(
      <ListToolbar
        search={search()}
        sort={{ value: "-created_at", onChange, options: sortOptions }}
      />,
    );
    const select = screen.getByRole("combobox", { name: "Sort" }) as HTMLSelectElement;
    expect(select.value).toBe("-created_at");
    fireEvent.change(select, { target: { value: "created_at" } });
    expect(onChange).toHaveBeenCalledWith("created_at");
  });

  it("renders no sort picker when the list cannot be reordered", () => {
    render(<ListToolbar search={search()} />);
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("renders the filters slot and an active-filter count badge", () => {
    render(
      <ListToolbar
        search={search()}
        filters={<button type="button">Filters</button>}
        activeFilterCount={3}
      />,
    );
    expect(screen.getByRole("button", { name: "Filters" })).toBeTruthy();
    expect(screen.getByText("3 active")).toBeTruthy();
  });

  it("omits the count badge when nothing is applied", () => {
    render(<ListToolbar search={search()} activeFilterCount={0} />);
    expect(screen.queryByText(/active/)).toBeNull();
  });

  it("opts into the ADMIN_PANEL surface only when asked", () => {
    const { container, rerender } = render(<ListToolbar search={search()} />);
    expect(container.firstElementChild?.className).not.toContain("bg-surface-muted");
    rerender(<ListToolbar search={search()} panel />);
    expect(container.firstElementChild?.className).toContain("bg-surface-muted");
  });

  it("renders trailing actions last", () => {
    render(<ListToolbar search={search()} actions={<button type="button">Refresh</button>} />);
    expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
  });
});

describe("ListSearch", () => {
  it("keeps the draft local and only submits on Search", () => {
    const onSubmit = vi.fn();
    render(<ListSearch label="Search videos" placeholder="Search" value="" onSubmit={onSubmit} />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search videos" }), {
      target: { value: "cats " },
    });
    // Typing must not refetch or rewrite the URL.
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(onSubmit).toHaveBeenCalledWith("cats");
  });

  it("does not resubmit a term that is already applied", () => {
    const onSubmit = vi.fn();
    render(<ListSearch label="Search videos" placeholder="Search" value="cats" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits the empty term on Clear", () => {
    const onSubmit = vi.fn();
    render(<ListSearch label="Search videos" placeholder="Search" value="cats" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onSubmit).toHaveBeenCalledWith("");
  });

  it("re-syncs the box when the applied term changes underneath it (Back)", () => {
    const { rerender } = render(
      <ListSearch label="Search videos" placeholder="Search" value="cats" onSubmit={() => {}} />,
    );
    expect(screen.getByRole("searchbox", { name: "Search videos" })).toHaveProperty("value", "cats");
    rerender(<ListSearch label="Search videos" placeholder="Search" value="dogs" onSubmit={() => {}} />);
    expect(screen.getByRole("searchbox", { name: "Search videos" })).toHaveProperty("value", "dogs");
  });
});
