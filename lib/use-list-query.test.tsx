// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The hook's whole job is URL sync, so the router is the thing under test.
// Mirror `SearchAutocomplete.test.tsx`'s navigation stub: a mutable `nav` the
// test drives, and a `replace` spy standing in for the real navigation.
const replace = vi.fn((url: string) => {
  nav.params = new URLSearchParams(url.split("?")[1] ?? "");
});
const nav = { pathname: "/admin/users", params: new URLSearchParams() };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => nav.pathname,
  useSearchParams: () => nav.params,
}));

import { useListQuery } from "./use-list-query";

beforeEach(() => {
  nav.pathname = "/admin/users";
  nav.params = new URLSearchParams();
  replace.mockClear();
});

afterEach(cleanup);

/** The query string the hook last navigated to. */
function lastQuery() {
  const url = replace.mock.calls.at(-1)?.[0] ?? "";
  return url.split("?")[1] ?? "";
}

describe("useListQuery", () => {
  it("defaults to limit 20 / offset 0 / no sort / no filters", () => {
    const { result } = renderHook(() => useListQuery());
    expect(result.current.limit).toBe(20);
    expect(result.current.offset).toBe(0);
    expect(result.current.sort).toBe("");
    expect(result.current.filters).toEqual({});
    expect(result.current.activeFilterCount).toBe(0);
  });

  it("reads limit / offset / sort / filters out of the URL", () => {
    nav.params = new URLSearchParams("limit=50&offset=100&sort=-created_at&state=failed");
    const { result } = renderHook(() => useListQuery({ filterKeys: ["state"] }));
    expect(result.current.limit).toBe(50);
    expect(result.current.offset).toBe(100);
    expect(result.current.sort).toBe("-created_at");
    expect(result.current.filters).toEqual({ state: "failed" });
    expect(result.current.activeFilterCount).toBe(1);
  });

  it("clamps a limit outside the backend's [1,100] contract", () => {
    nav.params = new URLSearchParams("limit=5000");
    const { result, rerender } = renderHook(() => useListQuery());
    expect(result.current.limit).toBe(100);
    nav.params = new URLSearchParams("limit=-3");
    rerender();
    expect(result.current.limit).toBe(1);
  });

  it("falls back to the default limit when the URL says nothing or nonsense", () => {
    // Number(null) is 0 — the trap this guards.
    const { result, rerender } = renderHook(() => useListQuery({ defaultLimit: 50 }));
    expect(result.current.limit).toBe(50);
    nav.params = new URLSearchParams("limit=abc");
    rerender();
    expect(result.current.limit).toBe(50);
  });

  it("moves the window without resetting anything else", () => {
    nav.params = new URLSearchParams("limit=50&sort=-created_at");
    const { result } = renderHook(() => useListQuery());
    act(() => result.current.setOffset(100));
    expect(lastQuery()).toContain("offset=100");
    expect(lastQuery()).toContain("limit=50");
    expect(lastQuery()).toContain("sort=-created_at");
  });

  it("resets the offset when the page size changes", () => {
    nav.params = new URLSearchParams("limit=100&offset=400");
    const { result } = renderHook(() => useListQuery());
    act(() => result.current.setLimit(5));
    expect(lastQuery()).toBe("limit=5");
  });

  it("resets the offset when the sort changes", () => {
    nav.params = new URLSearchParams("offset=400");
    const { result } = renderHook(() => useListQuery());
    act(() => result.current.setSort("-created_at"));
    expect(lastQuery()).toBe("sort=-created_at");
  });

  it("resets the offset when a filter changes", () => {
    nav.params = new URLSearchParams("offset=400");
    const { result } = renderHook(() => useListQuery({ filterKeys: ["state"] }));
    act(() => result.current.setFilter("state", "failed"));
    expect(lastQuery()).toBe("state=failed");
  });

  it("clears a filter when set to empty", () => {
    nav.params = new URLSearchParams("state=failed");
    const { result } = renderHook(() => useListQuery({ filterKeys: ["state"] }));
    act(() => result.current.setFilter("state", ""));
    expect(lastQuery()).toBe("");
  });

  it("changes several filters in one navigation", () => {
    const { result } = renderHook(() => useListQuery({ filterKeys: ["state", "kind"] }));
    act(() => result.current.setFilters({ state: "failed", kind: "transcode" }));
    expect(lastQuery()).toBe("state=failed&kind=transcode");
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("ignores a filter key the list does not own", () => {
    const { result } = renderHook(() => useListQuery({ filterKeys: ["state"] }));
    act(() => result.current.setFilters({ state: "failed", tab: "hijack" }));
    expect(lastQuery()).toBe("state=failed");
  });

  it("leaves another widget's params alone", () => {
    nav.params = new URLSearchParams("tab=queues&offset=40");
    const { result } = renderHook(() => useListQuery());
    act(() => result.current.setOffset(80));
    expect(lastQuery()).toBe("tab=queues&offset=80");
  });

  it("omits values equal to their default so a plain URL stays clean", () => {
    nav.params = new URLSearchParams("limit=50&offset=100&sort=name");
    const { result } = renderHook(() => useListQuery({ defaultLimit: 20, defaultSort: "name" }));
    act(() => result.current.setLimit(20));
    // limit back to its default and sort already at its default: both dropped.
    expect(lastQuery()).toBe("sort=name");
  });

  it("namespaces its params when two lists share a route", () => {
    nav.params = new URLSearchParams("runs_limit=50&runs_offset=100&limit=5");
    const { result } = renderHook(() => useListQuery({ prefix: "runs" }));
    expect(result.current.limit).toBe(50);
    expect(result.current.offset).toBe(100);
    act(() => result.current.setOffset(150));
    // The other list's `limit=5` survives untouched.
    expect(lastQuery()).toContain("limit=5");
    expect(lastQuery()).toContain("runs_offset=150");
  });

  it("drops only its own params on reset", () => {
    nav.params = new URLSearchParams("tab=queues&limit=50&offset=100&sort=name&state=failed");
    const { result } = renderHook(() => useListQuery({ filterKeys: ["state"] }));
    act(() => result.current.reset());
    expect(lastQuery()).toBe("tab=queues");
  });

  it("navigates with replace and without scrolling, so paging is not history spam", () => {
    const { result } = renderHook(() => useListQuery());
    act(() => result.current.setOffset(20));
    expect(replace).toHaveBeenCalledWith("/admin/users?offset=20", { scroll: false });
  });

  it("drops the trailing ? when nothing is left in the query string", () => {
    nav.params = new URLSearchParams("offset=20");
    const { result } = renderHook(() => useListQuery());
    act(() => result.current.setOffset(0));
    expect(replace).toHaveBeenCalledWith("/admin/users", { scroll: false });
  });
});
