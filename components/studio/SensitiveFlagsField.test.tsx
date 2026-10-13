// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SensitiveFlagsField } from "./SensitiveFlagsField";

afterEach(cleanup);

describe("SensitiveFlagsField", () => {
  it("shows one checkbox per kind, reflecting the current set", () => {
    render(<SensitiveFlagsField value={["sex"]} onChange={() => {}} />);
    expect((screen.getByLabelText(/Sexual content/) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/Violent or graphic/) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText(/Shocking or disturbing/) as HTMLInputElement).checked).toBe(false);
  });

  it("emits the new set in canonical order, whatever order they were ticked in", () => {
    const onChange = vi.fn();
    render(<SensitiveFlagsField value={["sex"]} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/Violent or graphic/));
    expect(onChange).toHaveBeenCalledWith(["violent", "sex"]);
  });

  it("unticking removes only that kind", () => {
    const onChange = vi.fn();
    render(<SensitiveFlagsField value={["violent", "sex"]} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/Violent or graphic/));
    expect(onChange).toHaveBeenCalledWith(["sex"]);
  });

  it("is inert while the form is locked", () => {
    render(<SensitiveFlagsField value={[]} onChange={() => {}} disabled />);
    expect((screen.getByLabelText(/Sexual content/) as HTMLInputElement).matches(":disabled")).toBe(true);
  });
});
