// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BanUserDialog } from "./BanUserDialog";

afterEach(() => cleanup());

describe("BanUserDialog", () => {
  it("will not submit without a reason", () => {
    const onConfirm = vi.fn();
    render(<BanUserDialog username="uma" busy={false} onConfirm={onConfirm} onClose={() => {}} />);
    const ban = screen.getByRole("button", { name: /^ban uma$/i }) as HTMLButtonElement;
    expect(ban.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "   " } });
    expect(ban.disabled).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("sends the trimmed reason and caps the field at 500 characters", () => {
    const onConfirm = vi.fn();
    render(<BanUserDialog username="uma" busy={false} onConfirm={onConfirm} onClose={() => {}} />);
    const field = screen.getByLabelText(/reason/i) as HTMLTextAreaElement;
    expect(field.maxLength).toBe(500);
    fireEvent.change(field, { target: { value: "  spam links  " } });
    fireEvent.click(screen.getByRole("button", { name: /^ban uma$/i }));
    expect(onConfirm).toHaveBeenCalledWith("spam links");
  });

  it("says the reason is emailed to the user", () => {
    render(<BanUserDialog username="uma" busy={false} onConfirm={() => {}} onClose={() => {}} />);
    expect(screen.getByText(/emailed to the user/i)).toBeTruthy();
  });
});
