// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SecretInput, type SecretInputProps } from "./SecretInput";

afterEach(cleanup);

const LABEL = "SMTP password";

/**
 * The real usage shape: the parent owns `value`, so "untouched" survives a
 * re-render. Testing focus movement needs it — the control that takes focus is
 * the one that MOUNTS after the parent applies the change.
 */
function Harness({
  onValue,
  initialValue,
  ...props
}: Omit<SecretInputProps, "value" | "onChange" | "label"> & {
  onValue?: (next: string | undefined) => void;
  initialValue?: string | undefined;
}) {
  const [value, setValue] = useState<string | undefined>(initialValue);
  return (
    <SecretInput
      {...props}
      label={LABEL}
      value={value}
      onChange={(next) => {
        onValue?.(next);
        setValue(next);
      }}
    />
  );
}

const field = () => screen.getByLabelText(LABEL) as HTMLInputElement;
const replaceButton = () =>
  screen.getByRole("button", { name: `Replace ${LABEL}` });
const cancelButton = () =>
  screen.getByRole("button", { name: `Cancel ${LABEL} change` });

describe("SecretInput", () => {
  it("shows an empty password box directly when nothing is stored", () => {
    render(<Harness isSet={false} />);
    expect(field().type).toBe("password");
    expect(field().value).toBe("");
    // Nothing to replace, nothing to cancel back to.
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("reports typed characters as the pending value", () => {
    const onValue = vi.fn();
    render(<Harness isSet={false} onValue={onValue} />);
    fireEvent.change(field(), { target: { value: "hunter2" } });
    expect(onValue).toHaveBeenLastCalledWith("hunter2");
    expect(field().value).toBe("hunter2");
  });

  it("shows a stored secret as a read-only saved state, never a value", () => {
    render(<Harness isSet />);
    expect(field().value).toBe("•••••••• saved");
    expect(field().readOnly).toBe(true);
    expect(field().type).toBe("text");
    expect(replaceButton()).toBeTruthy();
  });

  it("Replace opens an empty password box and moves focus into it", () => {
    const onValue = vi.fn();
    render(<Harness isSet onValue={onValue} />);
    fireEvent.click(replaceButton());
    // "" (not undefined): the caller now SENDS this field, and an empty string
    // is the honest report of a box the user has not typed into yet.
    expect(onValue).toHaveBeenLastCalledWith("");
    expect(field().type).toBe("password");
    expect(field().value).toBe("");
    expect(document.activeElement).toBe(field());
  });

  it("Cancel returns to untouched and restores focus to Replace", () => {
    const onValue = vi.fn();
    render(<Harness isSet onValue={onValue} />);
    fireEvent.click(replaceButton());
    fireEvent.change(field(), { target: { value: "typed" } });
    fireEvent.click(cancelButton());
    // undefined is the whole point: the caller omits the field, so the stored
    // secret survives a save the admin did not mean to change it in.
    expect(onValue).toHaveBeenLastCalledWith(undefined);
    expect(field().value).toBe("•••••••• saved");
    expect(document.activeElement).toBe(replaceButton());
  });

  it("offers Remove only when clearing is allowed, and says what it will do", () => {
    const onValue = vi.fn();
    const { unmount } = render(<Harness isSet />);
    expect(screen.queryByRole("button", { name: `Remove ${LABEL}` })).toBeNull();
    unmount();

    render(<Harness isSet allowClear onValue={onValue} />);
    fireEvent.click(screen.getByRole("button", { name: `Remove ${LABEL}` }));
    expect(onValue).toHaveBeenLastCalledWith("");
    // "" reads as the removal it is, not as an empty box waiting for input.
    expect(field().value).toBe("Will be removed when you save");
    expect(field().readOnly).toBe(true);
    expect(document.activeElement).toBe(cancelButton());
  });

  it("Cancel undoes a pending removal", () => {
    render(<Harness isSet allowClear />);
    fireEvent.click(screen.getByRole("button", { name: `Remove ${LABEL}` }));
    fireEvent.click(cancelButton());
    expect(field().value).toBe("•••••••• saved");
    expect(replaceButton()).toBeTruthy();
  });

  it("disables every control and explains why, wired to the field", () => {
    render(
      <Harness
        isSet
        allowClear
        disabled
        disabledReason="This deployment holds no key to seal a secret with."
      />,
    );
    expect(field().disabled).toBe(true);
    for (const button of screen.getAllByRole("button")) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
    const note = screen.getByRole("note");
    expect(note.textContent).toBe(
      "This deployment holds no key to seal a secret with.",
    );
    expect(field().getAttribute("aria-describedby")).toContain(note.id);
  });

  it("keeps the ordinary hint when the field is not disabled", () => {
    render(<Harness isSet={false} hint="Paste the key from your provider." />);
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.getByText("Paste the key from your provider.")).toBeTruthy();
  });

  it("defaults autocomplete away from this site's saved password", () => {
    render(<Harness isSet={false} />);
    expect(field().getAttribute("autocomplete")).toBe("new-password");
  });
});
