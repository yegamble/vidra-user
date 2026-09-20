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
/** The stored state is a status row, not a control — read it by its live region. */
const status = () => screen.getByRole("status");
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

  it("shows a stored secret as a status row, never a textbox holding a mask", () => {
    render(<Harness isSet />);
    // A textbox would announce its VALUE verbatim, so eight bullet characters
    // would precede the one word that matters. There is no textbox here.
    expect(screen.queryByLabelText(LABEL)).toBeNull();
    expect(status().textContent).toBe("Saved");
    expect(replaceButton()).toBeTruthy();
  });

  it("names the credential's state from every button that acts on it", () => {
    render(<Harness isSet allowClear />);
    const id = status().id;
    expect(replaceButton().getAttribute("aria-describedby")).toBe(id);
    expect(
      screen.getByRole("button", { name: `Remove ${LABEL}` }).getAttribute("aria-describedby"),
    ).toBe(id);
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
    expect(status().textContent).toBe("Saved");
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
    // "" reads as the removal it is, not as an empty box waiting for input —
    // and it is announced, because the only other change is where focus went.
    expect(status().textContent).toBe("Will be removed when you save");
    // Cancel is the control focus lands on. It is deliberately NOT described by
    // that sentence: the live region above has just announced it, and a
    // description would read it straight back a second time.
    expect(document.activeElement).toBe(cancelButton());
    expect(cancelButton().getAttribute("aria-describedby")).toBeNull();
  });

  it("Cancel undoes a pending removal", () => {
    render(<Harness isSet allowClear />);
    fireEvent.click(screen.getByRole("button", { name: `Remove ${LABEL}` }));
    fireEvent.click(cancelButton());
    expect(status().textContent).toBe("Saved");
    expect(replaceButton()).toBeTruthy();
  });

  it("disables every control and explains why, wired to the field", () => {
    render(
      <Harness
        isSet={false}
        disabled
        disabledReason="This deployment holds no key to seal a secret with."
      />,
    );
    expect(field().disabled).toBe(true);
    const note = screen.getByRole("note");
    expect(note.textContent).toBe(
      "This deployment holds no key to seal a secret with.",
    );
    expect(field().getAttribute("aria-describedby")).toContain(note.id);
  });

  it("disables the buttons of a stored secret and still explains why", () => {
    render(
      <Harness
        isSet
        allowClear
        disabled
        disabledReason="This deployment holds no key to seal a secret with."
      />,
    );
    for (const button of screen.getAllByRole("button")) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
    // A disabled control is not focusable, so this note is unreachable by
    // keyboard on its own — the page-level warning beside it is what carries
    // the explanation, and this is only the field-local echo of it.
    expect(screen.getByRole("note").textContent).toBe(
      "This deployment holds no key to seal a secret with.",
    );
  });

  it("keeps the ordinary hint when the field is not disabled", () => {
    render(<Harness isSet={false} hint="Paste the key from your provider." />);
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.getByText("Paste the key from your provider.")).toBeTruthy();
  });

  it("never invites the browser to generate a password", () => {
    // "new-password" is the token Safari/Chrome read as "offer a generated
    // strong password here", and a generated one cannot authenticate against
    // the provider that issued the real key.
    render(<Harness isSet={false} />);
    expect(field().getAttribute("autocomplete")).toBe("off");
  });
});
