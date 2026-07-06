"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { ApiError, authApi, errorMessage } from "@/lib/api";

// Completes a password reset: the user arrives from the reset email link with a
// single-use token in the URL, chooses a new password, and on success is sent to
// sign in (the backend revokes all existing sessions). An invalid/expired token
// (or a missing one) points the user back to request a fresh link.
export function ResetPasswordConfirmForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    setPasswordError(null);
    setFormError(null);
    setExpired(false);
    if (password !== confirm) {
      setPasswordError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await authApi.confirmPasswordReset({ token, password });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setExpired(true);
      } else if (err instanceof ApiError && err.fields && err.fields.length > 0) {
        const pw = err.fields.find((f) => f.field === "password");
        setPasswordError(pw ? pw.message : err.message);
      } else {
        setFormError(errorMessage(err));
      }
      setSubmitting(false);
    }
  }

  // No token in the link (or the backend rejected it as invalid/expired): send
  // the user back to request a fresh one.
  if (!token || expired) {
    return (
      <div className="flex flex-col gap-4">
        <p
          role="alert"
          className="rounded-xl border border-danger-border bg-danger-surface px-3.5 py-2.5 text-sm text-danger"
        >
          This reset link is invalid or has expired.
        </p>
        <p className="text-center text-sm text-fg-muted">
          <Link
            href="/reset-password"
            className="focus-ring rounded-sm font-semibold text-fg hover:underline"
          >
            Request a new reset link
          </Link>
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <p
          role="status"
          className="rounded-xl bg-success/15 px-3.5 py-2.5 text-sm text-success"
        >
          Your password has been reset. You can now sign in with your new password.
        </p>
        <p className="text-center text-sm text-fg-muted">
          <Link href="/login" className="focus-ring rounded-sm font-semibold text-fg hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  const inputClass =
    "focus-ring w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg placeholder:text-fg-muted disabled:opacity-60";

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-4"
    >
      {formError ? (
        <p
          role="alert"
          className="rounded-xl border border-danger-border bg-danger-surface px-3.5 py-2.5 text-sm text-danger"
        >
          {formError}
        </p>
      ) : null}

      <div className="flex flex-col gap-1">
        <label htmlFor="reset-password" className="text-sm font-medium">
          New password
        </label>
        <input
          id="reset-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={passwordError ? true : undefined}
          aria-describedby={passwordError ? "reset-password-error" : undefined}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="reset-password-confirm" className="text-sm font-medium">
          Confirm new password
        </label>
        <input
          id="reset-password-confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={passwordError ? true : undefined}
          aria-describedby={passwordError ? "reset-password-error" : undefined}
          className={inputClass}
        />
        {passwordError ? (
          <p id="reset-password-error" className="text-xs text-danger">
            {passwordError}
          </p>
        ) : null}
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={submitting}>
        {submitting ? "Resetting…" : "Reset password"}
      </Button>
    </form>
  );
}
