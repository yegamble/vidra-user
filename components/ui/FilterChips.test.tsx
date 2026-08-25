// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FilterChip, FilterChipGroup, TriStateFilter, triStateValue } from "./FilterChips";

afterEach(cleanup);

const reportFilters = [
  { value: "open", label: "Open" },
  { value: "all", label: "All" },
] as const;

describe("FilterChip", () => {
  it("carries its applied state as aria-pressed", () => {
    render(
      <FilterChip active onClick={() => {}}>
        Open
      </FilterChip>,
    );
    expect(screen.getByRole("button", { name: "Open" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps a border in both states so the row never reflows on toggle", () => {
    // The bug in the AdminUsersView copy: the active chip dropped its border and
    // the whole facet row shifted 1px.
    const { rerender } = render(
      <FilterChip active={false} onClick={() => {}}>
        Staff
      </FilterChip>,
    );
    expect(screen.getByRole("button", { name: "Staff" }).className).toContain("border-border");
    rerender(
      <FilterChip active onClick={() => {}}>
        Staff
      </FilterChip>,
    );
    expect(screen.getByRole("button", { name: "Staff" }).className).toContain("border-accent");
  });

  it("does not fire while disabled", () => {
    const onClick = vi.fn();
    render(
      <FilterChip active={false} disabled onClick={onClick}>
        Staff
      </FilterChip>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Staff" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("FilterChipGroup", () => {
  it("is a named group of aria-pressed chips", () => {
    render(
      <FilterChipGroup
        options={reportFilters}
        value="open"
        onChange={() => {}}
        label="Filter reports"
      />,
    );
    expect(screen.getByRole("group", { name: "Filter reports" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("reports the chosen value and ignores a re-click of the active chip", () => {
    const onChange = vi.fn();
    render(
      <FilterChipGroup
        options={reportFilters}
        value="open"
        onChange={onChange}
        label="Filter reports"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(onChange).toHaveBeenCalledWith("all");
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("announces the optional per-option count as part of the chip's name", () => {
    // The AdminUsersView facet row ("All · 4649") is a count-carrying group.
    // The visible text keeps the middot; the accessible name uses a comma,
    // because the name algorithm trims each text node before joining and would
    // otherwise squash the visible form to "All· 4649".
    render(
      <FilterChipGroup
        options={[
          { value: "all", label: "All", count: 4649 },
          { value: "staff", label: "Staff", count: 3 },
          { value: "deactivated", label: "Deactivated", count: 12 },
        ]}
        value="all"
        onChange={() => {}}
        size="sm"
        label="Filter users"
      />,
    );
    expect(screen.getByRole("button", { name: "All, 4649" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Staff, 3" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "All, 4649" }).textContent).toBe("All · 4649");
  });

  // The consolidation claim, made checkable: each of the three hand-rolled
  // copies this primitive replaces is expressible as one FilterChipGroup with
  // the same accessible shape the original rendered.
  it.each([
    {
      surface: "ModerationQueue",
      group: "Filter reports",
      size: "md" as const,
      options: [
        { value: "open", label: "Open" },
        { value: "all", label: "All" },
      ],
      selected: "open",
      names: ["Open", "All"],
    },
    {
      surface: "AdminRegistrationRequestsView",
      group: "Filter registration requests",
      size: "md" as const,
      options: [
        { value: "pending", label: "Pending" },
        { value: "all", label: "All" },
      ],
      selected: "pending",
      names: ["Pending", "All"],
    },
    {
      surface: "AdminUsersView",
      group: "Filter users",
      size: "sm" as const,
      options: [
        { value: "all", label: "All", count: 4649 },
        { value: "staff", label: "Staff", count: 3 },
        { value: "deactivated", label: "Deactivated", count: 12 },
      ],
      selected: "all",
      names: ["All, 4649", "Staff, 3", "Deactivated, 12"],
    },
  ])("reproduces the $surface filter row", ({ group, size, options, selected, names }) => {
    render(
      <FilterChipGroup
        options={options}
        value={selected}
        onChange={() => {}}
        size={size}
        label={group}
      />,
    );
    expect(screen.getByRole("group", { name: group })).toBeTruthy();
    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent)).toEqual(
      names,
    );
    expect(screen.getByRole("button", { name: names[0] }).getAttribute("aria-pressed")).toBe("true");
  });

  it("names the group from a visible heading when labelledBy is given", () => {
    render(
      <>
        <h2 id="facets">Accounts</h2>
        <FilterChipGroup
          options={reportFilters}
          value="open"
          onChange={() => {}}
          labelledBy="facets"
        />
      </>,
    );
    expect(screen.getByRole("group", { name: "Accounts" })).toBeTruthy();
  });
});

describe("TriStateFilter", () => {
  it("offers all three states, with Any as the absent parameter", () => {
    render(<TriStateFilter label="HLS renditions" value="" onChange={() => {}} />);
    const group = screen.getByRole("group", { name: "HLS renditions" });
    expect(
      Array.from(group.querySelectorAll("button")).map((b) => b.textContent),
    ).toEqual(["Any", "Yes", "No"]);
    expect(screen.getByRole("button", { name: "Any" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("can express the negative half — the query a checkbox would delete", () => {
    const onChange = vi.fn();
    render(<TriStateFilter label="HLS renditions" value="" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "No" }));
    expect(onChange).toHaveBeenCalledWith("false");
  });

  it("maps its URL value onto the boolean the API client wants", () => {
    expect(triStateValue("true")).toBe(true);
    // The distinction the whole control exists for: false is a filter, absent is not.
    expect(triStateValue("false")).toBe(false);
    expect(triStateValue("")).toBeUndefined();
    expect(triStateValue(undefined)).toBeUndefined();
  });
});
