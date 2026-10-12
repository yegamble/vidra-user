// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SUPPORT_TEXT_MAX, SupportTextField } from "./SupportTextField";

afterEach(cleanup);

describe("SupportTextField", () => {
  it("shows a live character counter and reports edits", () => {
    const onChange = vi.fn();
    render(<SupportTextField value="Ko-fi: ada" onChange={onChange} ariaLabel="Edit support text" />);
    expect(screen.getByText(`Markdown, shown behind the Support button. 10/${SUPPORT_TEXT_MAX}`)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Edit support text"), { target: { value: "Ko-fi: ada!" } });
    expect(onChange).toHaveBeenCalledWith("Ko-fi: ada!");
  });

  it("caps the field at the contract limit and counts characters, not bytes", () => {
    render(<SupportTextField value={"é".repeat(40)} onChange={() => {}} ariaLabel="Edit support text" />);
    expect(screen.getByLabelText("Edit support text").getAttribute("maxlength")).toBe(String(SUPPORT_TEXT_MAX));
    expect(screen.getByText(/40\/1000/)).toBeTruthy();
  });
});
