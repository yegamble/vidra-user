import { describe, expect, it } from "vitest";

import { shouldSendOnEnter } from "./composer-keys";

describe("shouldSendOnEnter", () => {
  it("sends on a plain Enter with a fine pointer", () => {
    expect(
      shouldSendOnEnter({ key: "Enter", shiftKey: false, isComposing: false, enterSends: true }),
    ).toBe(true);
  });

  it("does not send on Shift+Enter (newline)", () => {
    expect(
      shouldSendOnEnter({ key: "Enter", shiftKey: true, isComposing: false, enterSends: true }),
    ).toBe(false);
  });

  it("does not send while composing with an IME", () => {
    expect(
      shouldSendOnEnter({ key: "Enter", shiftKey: false, isComposing: true, enterSends: true }),
    ).toBe(false);
  });

  it("does not send on a coarse pointer (button-only) — Enter is a newline", () => {
    expect(
      shouldSendOnEnter({ key: "Enter", shiftKey: false, isComposing: false, enterSends: false }),
    ).toBe(false);
  });

  it("ignores non-Enter keys", () => {
    for (const key of ["a", " ", "Tab", "Backspace"]) {
      expect(shouldSendOnEnter({ key, shiftKey: false, isComposing: false, enterSends: true })).toBe(
        false,
      );
    }
  });
});
