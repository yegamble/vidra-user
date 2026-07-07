// The composer's keyboard-send decision, kept pure so the Enter / Shift+Enter /
// IME / pointer matrix is exhaustively unit-testable (the component just wires
// a real KeyboardEvent into it).
//
// Contract (decided 2026-07-07, messaging-v2 §7):
//   • desktop / fine pointer: Enter sends, Shift+Enter inserts a newline;
//   • coarse pointer (touch): Enter is always a newline, the button sends;
//   • IME composition (selecting a candidate with Enter) never sends.
export function shouldSendOnEnter(opts: {
  key: string;
  shiftKey: boolean;
  isComposing: boolean;
  enterSends: boolean;
}): boolean {
  const { key, shiftKey, isComposing, enterSends } = opts;
  if (key !== "Enter") return false;
  if (shiftKey) return false;
  if (isComposing) return false;
  return enterSends;
}
