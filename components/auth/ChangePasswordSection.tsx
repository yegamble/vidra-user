"use client";

import Link from "next/link";
import { useId, useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { ApiError, authApi, errorMessage } from "@/lib/api";

// The same floor the API enforces (registration, the reset, and this endpoint
// all share it). Checked here only so a too-short password is caught before a
// round trip — the server remains the authority and its 422 is surfaced as-is.
const MIN_PASSWORD_LENGTH = 8;

/**
 * ChangePasswordSection is the /settings/security front for
 * POST /api/v1/auth/me/password. Before it, the ONLY way to rotate a password
 * was the forgotten-password flow: a user who still knew their password had to
 * pretend they did not, and a user whose mailbox was gone could not change it at
 * all. It sits next to "Signed-in devices" because that is the consequence — a
 * successful change signs every other device out.
 *
 * The typed passwords live in component state and are cleared on success; they
 * are never logged, never put in a URL, and never sent anywhere but the change
 * endpoint.
 */
export function ChangePasswordSection() {
  const titleId = useId();
  const currentId = useId();
  const nextId = useId();
  const confirmId = useId();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<React.ReactNode | null>(null);
  const [done, setDone] = useState(false);

  const filled = current !== "" && next !== "" && confirm !== "";

  async function submit() {
    setError(null);
    setDone(false);

    // Confirmation is a client-only field — the API never sees it — so its
    // mismatch is caught here rather than spent on a request.
    if (next !== confirm) {
      setError("The new passwords do not match.");
      return;
    }
    if (next.length < MIN_PASSWORD_LENGTH) {
      setError(`Your new password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (next === current) {
      setError("Your new password must be different from your current one.");
      return;
    }

    setBusy(true);
    try {
      await authApi.changePassword({ current_password: current, new_password: next });
      // Clear the fields before showing the confirmation: leaving a password
      // sitting in an input after the flow is done is how it ends up in a
      // screenshot or a shared screen.
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError("That is not your current password.");
      } else if (err instanceof ApiError && err.status === 409) {
        // The OAuth/ATProto-only shape: there is no current password to supply,
        // so the honest answer is the flow that CAN set one.
        setError(
          <>
            This account signs in without a password, so there is none to change. Use{" "}
            <Link href="/reset-password" className="focus-ring rounded-sm font-semibold underline">
              password reset
            </Link>{" "}
            to set one.
          </>,
        );
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    // aria-labelledby makes this a NAMED region. It matters here specifically:
    // when two-factor is on, its "turn off" form has a "Current password" field
    // too, so the page carries two identically-labelled inputs and the section
    // name is what tells them apart to a screen reader.
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface p-4"
    >
      <div className="flex flex-col gap-1">
        <h2 id={titleId} className="text-base font-semibold tracking-tight text-fg">
          Password
        </h2>
        <p className="text-sm text-fg-muted">
          Changing your password signs you out of every other device. This one stays signed in.
        </p>
      </div>

      {error ? <Alert as="div">{error}</Alert> : null}
      {done ? (
        <Alert variant="success">
          Your password was changed, and every other device was signed out.
        </Alert>
      ) : null}

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="flex flex-col gap-3"
      >
        <Field
          id={currentId}
          label="Current password"
          autoComplete="current-password"
          value={current}
          onChange={setCurrent}
        />
        <Field
          id={nextId}
          label="New password"
          autoComplete="new-password"
          value={next}
          onChange={setNext}
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        />
        <Field
          id={confirmId}
          label="Confirm new password"
          autoComplete="new-password"
          value={confirm}
          onChange={setConfirm}
        />
        <button
          type="submit"
          disabled={busy || !filled}
          className="focus-ring self-start rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent/90 disabled:opacity-60"
        >
          {busy ? "Changing…" : "Change password"}
        </button>
      </form>
    </section>
  );
}

function Field({
  id,
  label,
  autoComplete,
  value,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  const hintId = `${id}-hint`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type="password"
        autoComplete={autoComplete}
        required
        value={value}
        aria-describedby={hint ? hintId : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="focus-ring w-full max-w-sm rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg"
      />
      {hint ? (
        <p id={hintId} className="text-xs text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
