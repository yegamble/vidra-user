// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OtpInput } from "./OtpInput";

afterEach(cleanup);

describe("OtpInput", () => {
  it("renders `length` labeled digit boxes inside a named group", () => {
    render(<OtpInput length={6} label="Authentication code" onChange={() => {}} />);
    expect(screen.getByRole("group", { name: "Authentication code" })).toBeTruthy();
    expect(screen.getByLabelText("Authentication code digit 1")).toBeTruthy();
    expect(screen.getByLabelText("Authentication code digit 6")).toBeTruthy();
  });

  it("reports the combined value as digits are typed and advances focus", () => {
    const onChange = vi.fn();
    render(<OtpInput length={4} label="Code" onChange={onChange} />);
    const box1 = screen.getByLabelText("Code digit 1") as HTMLInputElement;
    fireEvent.change(box1, { target: { value: "7" } });
    expect(onChange).toHaveBeenLastCalledWith("7");
    // Focus moved to the second box.
    expect(document.activeElement).toBe(screen.getByLabelText("Code digit 2"));
  });

  it("spreads a multi-digit change (paste/fill) across the boxes and fires onComplete", () => {
    const onChange = vi.fn();
    const onComplete = vi.fn();
    render(<OtpInput length={6} label="Code" onChange={onChange} onComplete={onComplete} />);
    const box1 = screen.getByLabelText("Code digit 1") as HTMLInputElement;
    fireEvent.change(box1, { target: { value: "123456" } });
    expect(onChange).toHaveBeenLastCalledWith("123456");
    expect(onComplete).toHaveBeenCalledWith("123456");
    expect((screen.getByLabelText("Code digit 6") as HTMLInputElement).value).toBe("6");
  });

  it("strips non-digits from typed input", () => {
    const onChange = vi.fn();
    render(<OtpInput length={4} label="Code" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Code digit 1"), { target: { value: "a" } });
    expect(onChange).not.toHaveBeenCalledWith("a");
  });

  it("backspace on an empty box clears and steps to the previous box", () => {
    const onChange = vi.fn();
    render(<OtpInput length={4} label="Code" onChange={onChange} />);
    const box1 = screen.getByLabelText("Code digit 1") as HTMLInputElement;
    const box2 = screen.getByLabelText("Code digit 2") as HTMLInputElement;
    fireEvent.change(box1, { target: { value: "9" } }); // box1 = 9, focus box2
    fireEvent.keyDown(box2, { key: "Backspace" });
    expect(onChange).toHaveBeenLastCalledWith(""); // box1 cleared
    expect(document.activeElement).toBe(box1);
  });

  it("marks filled boxes with the design's solid border and leaves empty ones bordered", () => {
    render(<OtpInput length={2} label="Code" onChange={() => {}} />);
    const box1 = screen.getByLabelText("Code digit 1") as HTMLInputElement;
    const box2 = screen.getByLabelText("Code digit 2") as HTMLInputElement;
    fireEvent.change(box1, { target: { value: "4" } });
    expect(box1.className).toContain("border-fg");
    expect(box2.className).toContain("border-border");
  });
});
