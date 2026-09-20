"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";

export type SecretInputProps = {
  /** Visible label, and the distinguishing half of every button's a11y name. */
  label: string;
  /** Helper text under the field (hidden while an error shows). */
  hint?: string;
  /** Field-level error; wires aria-invalid + the danger border via Input. */
  error?: string;
  /**
   * The server says a value is stored. The value ITSELF is never part of this
   * contract: a write-only secret is never returned, so there is nothing to
   * render but the fact that one exists.
   */
  isSet: boolean;
  /**
   * The pending value. `undefined` means UNTOUCHED — the caller must then omit
   * this field from its request entirely, which is what keeps a stored secret
   * alive across a save that did not mean to change it. `""` means clear it.
   */
  value: string | undefined;
  onChange: (next: string | undefined) => void;
  /**
   * Offer "Remove" on a stored secret. Only for secrets the backend accepts an
   * empty value for (e.g. an SMTP relay that takes no password); a provider API
   * key has no valid empty state, so its field must not offer one.
   */
  allowClear?: boolean;
  disabled?: boolean;
  /**
   * Why the field is disabled — e.g. this deployment holds no key to seal a
   * secret with, so saving one would fail. Rendered where the hint goes, as a
   * note: it is an aside about the field, not instructions for filling it in.
   */
  disabledReason?: string;
  placeholder?: string;
  /**
   * Defaults to "off". Every field here holds a credential the PROVIDER issued,
   * so there is nothing for a password manager to contribute: "new-password" —
   * the obvious-looking choice — is the token Safari and Chrome read as "offer
   * a generated strong password here", and a generated one silently replaces
   * the provider's key with a string that cannot authenticate. Pass
   * "new-password" only where a freshly invented secret is actually valid.
   */
  autoComplete?: string;
  name?: string;
  id?: string;
};

/** What the status row says about a secret the server is already holding. */
const SAVED_STATUS = "Saved";
/** …and about one the next save will delete. */
const CLEARED_STATUS = "Will be removed when you save";

/**
 * SecretInput — a write-only credential field.
 *
 * The problem it solves is that a stored secret can be reported but never read
 * back, so the ordinary controlled-input shape ("render the current value, send
 * whatever is in the box") cannot express it. Here the three answers a form has
 * to be able to send are distinct values of one prop: `undefined` = leave the
 * stored secret alone (the caller OMITS the field), a non-empty string = set
 * this, `""` = clear it. A form that forgets the first case silently wipes a
 * credential on every unrelated save, which is why "untouched" is a value and
 * not the absence of one.
 *
 * States: a stored-and-untouched secret shows a STATUS ROW — the mask as
 * decoration, "Saved" as the text — with Replace (and Remove, when the field is
 * legitimately clearable); Replace opens an empty password box focused ready to
 * type, with Cancel back to untouched; a field with nothing stored is simply
 * the password box.
 *
 * The stored state is a status row and not a read-only textbox because a
 * textbox announces its VALUE verbatim and no ARIA can override that: eight
 * U+2022 would precede the one word that matters. The row is also a live region,
 * so pressing Remove — which changes nothing visible except this sentence and
 * moves focus to a button named only "Cancel" — announces what the next save
 * will do, and every button below is `aria-describedby` it, so the same sentence
 * is read on focus rather than living in a box nobody visits.
 *
 * Focus moves with the state change — into the box on Replace, back onto the
 * button on Cancel — via `autoFocus` on the control that MOUNTS, which is what
 * makes the trip keyboard-navigable without a ref reaching into the primitives.
 */
export function SecretInput({
  label,
  hint,
  error,
  isSet,
  value,
  onChange,
  allowClear = false,
  disabled = false,
  disabledReason,
  placeholder,
  autoComplete = "off",
  name,
  id,
}: SecretInputProps) {
  // Which control the user asked for, so a pending "" reads as the removal the
  // Remove button meant rather than as an empty box someone has yet to fill.
  const [intent, setIntent] = useState<"replace" | "clear" | null>(null);
  // The control that should take focus the next time it mounts. Set by the
  // action, consumed by `autoFocus`; null on first mount so a page carrying a
  // secret field never steals focus on load.
  const [focusOnMount, setFocusOnMount] = useState<
    "field" | "replace" | "cancel" | null
  >(null);
  const reactId = useId();
  const statusId = `${id ?? reactId}-secret-status`;

  const touched = value !== undefined;
  const saved = isSet && !touched;
  const cleared = isSet && touched && intent === "clear";
  const editing = !saved && !cleared;

  const note = disabled && disabledReason ? disabledReason : undefined;

  function replace() {
    setIntent("replace");
    setFocusOnMount("field");
    onChange("");
  }

  function remove() {
    setIntent("clear");
    setFocusOnMount("cancel");
    onChange("");
  }

  function cancel() {
    setIntent(null);
    setFocusOnMount("replace");
    onChange(undefined);
  }

  return (
    <div className="flex flex-col gap-2">
      {editing ? (
        <Input
          // Keyed so switching states MOUNTS the new box instead of letting
          // React reuse the read-only one's DOM node — `autoFocus` only fires
          // on mount, and a reused node would leave focus behind on Replace.
          key="editing"
          id={id}
          name={name}
          label={label}
          hint={note ?? hint}
          hintRole={note ? "note" : undefined}
          error={error}
          type="password"
          // The stored secret is never received, so the box opens EMPTY. A
          // masked stand-in would be a value the form could accidentally send.
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          spellCheck={false}
          autoFocus={focusOnMount === "field"}
          disabled={disabled}
        />
      ) : (
        <div className="flex flex-col gap-1">
          {/* Not a <label>: there is no form control here to point at, and a
              label with no control is a lie to the accessibility tree. */}
          <p className="text-sm font-medium text-fg">{label}</p>
          <div
            className={cn(
              "flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface-muted px-3.5 py-2",
              disabled && "opacity-60",
            )}
          >
            <span aria-hidden="true" className="text-sm text-fg-muted">
              ••••••••
            </span>
            <span id={statusId} role="status" className="text-sm text-fg">
              {saved ? SAVED_STATUS : CLEARED_STATUS}
            </span>
          </div>
          {(note ?? hint) ? (
            <p role={note ? "note" : undefined} className="text-xs text-fg-muted">
              {note ?? hint}
            </p>
          ) : null}
          {error ? <p className="text-xs text-danger">{error}</p> : null}
        </div>
      )}

      {isSet ? (
        <div className="flex flex-wrap gap-2">
          {saved ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={replace}
              disabled={disabled}
              autoFocus={focusOnMount === "replace"}
              aria-label={`Replace ${label}`}
              // Names the credential's state on focus, so "Replace" is never
              // reached without knowing what it would replace.
              aria-describedby={editing ? undefined : statusId}
            >
              Replace
            </Button>
          ) : null}
          {saved && allowClear ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={remove}
              disabled={disabled}
              aria-label={`Remove ${label}`}
              aria-describedby={editing ? undefined : statusId}
            >
              Remove
            </Button>
          ) : null}
          {!saved ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={cancel}
              disabled={disabled}
              autoFocus={focusOnMount === "cancel"}
              aria-label={`Cancel ${label} change`}
              // Deliberately NOT described by the status row: Remove changes
              // that row's text, which the live region announces, and then
              // moves focus here — describing it would read the same sentence
              // twice in a row.
            >
              Cancel
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
