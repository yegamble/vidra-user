// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Select } from "./Select";

afterEach(cleanup);

describe("Select", () => {
  it("associates its visible label with the native select", () => {
    render(
      <Select label="Language">
        <option value="en">English</option>
        <option value="fr">French</option>
      </Select>,
    );
    // getByLabelText resolves the label→control association (htmlFor/id).
    const select = screen.getByLabelText("Language");
    expect(select.tagName).toBe("SELECT");
  });

  it("reports a change through onChange", () => {
    const onChange = vi.fn();
    // Uncontrolled (defaultValue) so the DOM reflects the new selection — a
    // controlled select with a mock (no state write) would snap back.
    render(
      <Select label="Language" defaultValue="en" onChange={onChange}>
        <option value="en">English</option>
        <option value="fr">French</option>
      </Select>,
    );
    const select = screen.getByLabelText("Language") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "fr" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(select.value).toBe("fr");
  });

  it("wires aria-invalid + aria-describedby to the error message when errored", () => {
    render(
      <Select label="Language" error="Pick a language">
        <option value="">—</option>
      </Select>,
    );
    const select = screen.getByLabelText("Language");
    expect(select.getAttribute("aria-invalid")).toBe("true");
    const describedBy = select.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    // The referenced node carries the error copy.
    const errorNode = document.getElementById(describedBy as string);
    expect(errorNode?.textContent).toBe("Pick a language");
  });

  it("has no aria-invalid when valid", () => {
    render(
      <Select label="Language">
        <option value="en">English</option>
      </Select>,
    );
    expect(screen.getByLabelText("Language").getAttribute("aria-invalid")).toBeNull();
  });
});
