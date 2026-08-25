// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminPagination, PAGE_SIZE_OPTIONS } from "./AdminControls";

afterEach(cleanup);

describe("AdminPagination", () => {
  it("stays hidden for a single-page list when no page-size picker is wired", () => {
    // The historical contract the four existing call sites depend on.
    const { container } = render(
      <AdminPagination total={7} limit={100} offset={0} onOffset={() => {}} label="users" />,
    );
    expect(container.querySelector("nav")).toBeNull();
  });

  it("renders a single-page list once a page-size picker is wired", () => {
    render(
      <AdminPagination
        total={7}
        limit={100}
        offset={0}
        onOffset={() => {}}
        onPageSize={() => {}}
        label="users"
      />,
    );
    expect(screen.getByRole("navigation", { name: "Paginate users" })).toBeTruthy();
    expect(screen.getByText("1–7 of 7")).toBeTruthy();
    expect(screen.getByText("Page 1 of 1")).toBeTruthy();
  });

  it("renders nothing at all when there are no rows", () => {
    const { container } = render(
      <AdminPagination
        total={0}
        limit={20}
        offset={0}
        onOffset={() => {}}
        onPageSize={() => {}}
        label="users"
      />,
    );
    expect(container.querySelector("nav")).toBeNull();
  });

  it("reports the current page alongside the row range", () => {
    render(
      <AdminPagination total={4649} limit={100} offset={200} onOffset={() => {}} label="users" />,
    );
    expect(screen.getByText("201–300 of 4649")).toBeTruthy();
    expect(screen.getByText("Page 3 of 47")).toBeTruthy();
  });

  it("offers 5/10/20/50/100 and reports the chosen size", () => {
    const onPageSize = vi.fn();
    render(
      <AdminPagination
        total={500}
        limit={20}
        offset={0}
        onOffset={() => {}}
        onPageSize={onPageSize}
        label="users"
      />,
    );
    const select = screen.getByRole("combobox", { name: "Rows per page" }) as HTMLSelectElement;
    expect([...select.options].map((o) => Number(o.value))).toEqual([...PAGE_SIZE_OPTIONS]);
    expect(select.value).toBe("20");
    fireEvent.change(select, { target: { value: "50" } });
    // A number, not the raw string — the caller feeds it straight back as `limit`.
    expect(onPageSize).toHaveBeenCalledWith(50);
  });

  it("offers an off-menu size rather than misreporting the current one", () => {
    render(
      <AdminPagination
        total={500}
        limit={25}
        offset={0}
        onOffset={() => {}}
        onPageSize={() => {}}
        label="users"
      />,
    );
    const select = screen.getByRole("combobox", { name: "Rows per page" }) as HTMLSelectElement;
    expect([...select.options].map((o) => Number(o.value))).toEqual([5, 10, 20, 25, 50, 100]);
    expect(select.value).toBe("25");
  });

  it("omits the picker entirely when onPageSize is not passed", () => {
    render(
      <AdminPagination total={4649} limit={100} offset={0} onOffset={() => {}} label="users" />,
    );
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("pages with Previous/Next and disables them at the ends", () => {
    const onOffset = vi.fn();
    const { rerender } = render(
      <AdminPagination total={250} limit={100} offset={0} onOffset={onOffset} label="users" />,
    );
    expect(screen.getByRole("button", { name: "Previous" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onOffset).toHaveBeenCalledWith(100);

    rerender(
      <AdminPagination total={250} limit={100} offset={200} onOffset={onOffset} label="users" />,
    );
    expect(screen.getByRole("button", { name: "Next" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(onOffset).toHaveBeenLastCalledWith(100);
  });

  it("never renders an infinite page count when the limit is nonsense", () => {
    // A hand-edited `?limit=0` must not reach the reader as "Page 1 of Infinity".
    render(
      <AdminPagination
        total={40}
        limit={0}
        offset={0}
        onOffset={() => {}}
        onPageSize={() => {}}
        label="users"
      />,
    );
    expect(screen.getByText("Page 1 of 40")).toBeTruthy();
  });
});
