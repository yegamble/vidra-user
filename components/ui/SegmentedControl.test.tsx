// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SegmentedControl } from "./SegmentedControl";

afterEach(cleanup);

const options = [
  { value: "local", label: "Local" },
  { value: "all", label: "All" },
] as const;

describe("SegmentedControl", () => {
  it("is a named group of aria-pressed toggle buttons", () => {
    render(
      <SegmentedControl options={options} value="local" onChange={() => {}} label="Feed scope" />,
    );
    const group = screen.getByRole("group", { name: "Feed scope" });
    expect(group.getAttribute("aria-label")).toBe("Feed scope");
    expect(screen.getByRole("button", { name: "Local" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("fires onChange with the value when an inactive segment is clicked", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl options={options} value="local" onChange={onChange} label="Feed scope" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(onChange).toHaveBeenCalledWith("all");
  });

  it("does not fire onChange when the active segment is re-clicked", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl options={options} value="local" onChange={onChange} label="Feed scope" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Local" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("disables every segment and suppresses onChange when disabled", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        options={options}
        value="local"
        onChange={onChange}
        label="Feed scope"
        disabled
      />,
    );
    const inactive = screen.getByRole("button", { name: "All" });
    expect((inactive as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(inactive);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("names the group via labelledBy when given (aria-labelledby, no aria-label)", () => {
    render(
      <>
        <span id="appearance-label">Appearance</span>
        <SegmentedControl
          options={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
          value="light"
          onChange={() => {}}
          labelledBy="appearance-label"
        />
      </>,
    );
    const group = screen.getByRole("group", { name: "Appearance" });
    expect(group.getAttribute("aria-labelledby")).toBe("appearance-label");
    expect(group.getAttribute("aria-label")).toBeNull();
  });

  it("renders an optional count suffix inside the segment's accessible name", () => {
    render(
      <SegmentedControl
        options={[
          { value: "reports", label: "Reports", count: 3 },
          { value: "signups", label: "Sign-ups", count: 0 },
        ]}
        value="reports"
        onChange={() => {}}
        label="Queues"
        fullWidth
      />,
    );
    // The count is part of the button text, so the accessible name includes it.
    expect(screen.getByRole("button", { name: "Reports 3" })).toBeTruthy();
  });
});
