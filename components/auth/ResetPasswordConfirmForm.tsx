"use client";

import Link from "next/link";
import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
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
        <Alert>
          This reset link is invalid or has expired.
        </Alert>
        <p className="text-center text-sm text-fg-muted">
          <Link
            href="/reset-password"
            className="focus-ring rounded-sm font-semibold text-accent-text transition-opacity hover:opacity-80"
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
        <Alert variant="success">
          Your password has been reset. You can now sign in with your new password.
        </Alert>
        <p className="text-center text-sm text-fg-muted">
          <Link href="/login" className="focus-ring rounded-sm font-semibold text-accent-text transition-opacity hover:opacity-80">
            Sign in
          </Link>
        </p>
      </div>
    );
  }

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
        <Alert>
          {formError}
        </Alert>
      ) : null}

      <Input
        id="reset-password"
        name="password"
        type="password"
        label="New password"
        autoComplete="new-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="min-h-12 text-base"
      />

      {/* The mismatch error is anchored to the confirm field — that's the one
          the user needs to correct. */}
      <Input
        id="reset-password-confirm"
        name="confirm"
        type="password"
        label="Confirm new password"
        autoComplete="new-password"
        required
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={passwordError ?? undefined}
        className="min-h-12 text-base"
      />

      <Button type="submit" size="lg" className="w-full" disabled={submitting}>
        {submitting ? "Resetting…" : "Reset password"}
      </Button>
    </form>
  );
}
