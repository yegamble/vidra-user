"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { authApi, errorMessage } from "@/lib/api";

// Requests a password-reset link. The backend always answers 202 (it never
// reveals whether the email belongs to an account), so on success we show the
// same neutral confirmation regardless — keeping the flow enumeration-safe.
export function ResetPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      await authApi.requestPasswordReset({ email });
      setSent(true);
    } catch (err) {
      setError(
        errorMessage(err, "Something went wrong. Please try again.", {
          "422": "Enter a valid email address.",
        }),
      );
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <p
          role="status"
          className="rounded-xl bg-success/15 px-3.5 py-2.5 text-sm text-success"
        >
          If an account exists for that email, we&apos;ve sent a link to reset your
          password. Check your inbox.
        </p>
        <p className="text-center text-subhead text-fg-muted">
          <Link
            href="/login"
            className="focus-ring rounded-sm font-semibold text-accent-text transition-opacity hover:opacity-80"
          >
            Back to sign in
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
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-danger-border bg-danger-surface px-3.5 py-2.5 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}

      <p className="text-sm text-fg-muted">
        Enter your account email and we&apos;ll send you a link to reset your password.
      </p>

      <Input
        id="reset-email"
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="min-h-12 text-base"
      />

      <Button type="submit" size="lg" className="w-full" disabled={submitting}>
        {submitting ? "Sending…" : "Send reset link"}
      </Button>

      <p className="text-center text-sm text-fg-muted">
        Remembered it?{" "}
        <Link href="/login" className="focus-ring rounded-sm font-semibold text-fg hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
