"use client";

import { useState } from "react";

import { ApiError, authApi } from "@/lib/api";

/**
 * ResendVerification — one control, used everywhere a person is stuck behind
 * the email-verification gate: the "check your email" panel after signup, and
 * the sign-in form when login answers 403 `email_verification_required`.
 *
 * Both places need the SAME thing and the same copy, so it is one component
 * rather than two: the backend route is enumeration-safe (202 with an empty
 * body for a known address, an unknown one, an already-verified one, and a
 * repeat inside its send cooldown alike), and any wording that promised "we
 * sent it to you" would turn that safe answer into a claim about whether the
 * address has an account here.
 *
 * There is no bearer token in this flow by design — the account that needs the
 * message is precisely the one whose login is refused.
 */
export function ResendVerification({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    setError(null);
    setState("sending");
    try {
      await authApi.resendEmailVerification({ email });
      setState("sent");
    } catch (err) {
      setState("idle");
      if (err instanceof ApiError && err.status === 429) {
        setError("Too many attempts — wait a minute and try again.");
      } else {
        setError("Could not send it just now. Try again in a moment.");
      }
    }
  }

  if (state === "sent") {
    return (
      <p className="text-sm text-fg-muted" data-testid="resend-verification-sent">
        If that address has an unconfirmed account here, a new link is on its way. It can take a
        minute to arrive — check your spam folder too.
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        disabled={state === "sending"}
        onClick={() => void resend()}
        className="focus-ring rounded-full border border-border px-4 py-2 text-sm font-semibold text-fg transition-colors hover:bg-surface-raised disabled:opacity-60"
      >
        {state === "sending" ? "Sending…" : "Resend verification email"}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
