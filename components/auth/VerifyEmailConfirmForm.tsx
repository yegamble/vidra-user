"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, authApi } from "@/lib/api";

type State = "verifying" | "done" | "expired" | "error";

// Completes email verification: the user arrives from the verification link with
// a single-use token in the URL, which we submit automatically. On success we
// re-fetch the session (if signed in) so the "verify your email" prompt clears.
export function VerifyEmailConfirmForm({ token }: { token: string }) {
  const { status, reloadUser } = useSession();
  const [state, setState] = useState<State>(token ? "verifying" : "expired");
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true; // guard the double-invoke in React strict mode (dev)
    authApi
      .confirmEmailVerification({ token })
      .then(async () => {
        setState("done");
        // Best-effort: refresh the account so email_verified flips in the UI.
        // Harmless if signed out (me() 401 is swallowed).
        try {
          await reloadUser();
        } catch {
          // ignore — the verification itself already succeeded
        }
      })
      .catch((err) => {
        setState(err instanceof ApiError && err.status === 400 ? "expired" : "error");
      });
  }, [token, reloadUser]);

  if (state === "verifying") {
    return (
      <div className="flex items-center justify-center gap-3 py-4">
        <Spinner label="Verifying" />
        <p className="text-sm text-fg-muted">Verifying your email…</p>
      </div>
    );
  }

  if (state === "done") {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="success">
          Your email has been verified. Thanks!
        </Alert>
        <p className="text-center text-sm text-fg-muted">
          <Link href="/" className="focus-ring rounded-sm font-semibold text-accent-text transition-opacity hover:opacity-80">
            Back to home
          </Link>
        </p>
      </div>
    );
  }

  // expired / invalid / unexpected error
  return (
    <div className="flex flex-col gap-4">
      <Alert>
        {state === "expired"
          ? "This verification link is invalid or has expired."
          : "Something went wrong verifying your email. Please try again."}
      </Alert>
      <p className="text-center text-sm text-fg-muted">
        {status === "authed" ? (
          <Link
            href="/settings"
            className="focus-ring rounded-sm font-semibold text-accent-text transition-opacity hover:opacity-80"
          >
            Resend the verification email
          </Link>
        ) : (
          <Link href="/login" className="focus-ring rounded-sm font-semibold text-accent-text transition-opacity hover:opacity-80">
            Sign in
          </Link>
        )}
      </p>
    </div>
  );
}
