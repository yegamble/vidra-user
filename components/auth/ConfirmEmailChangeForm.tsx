"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, authApi } from "@/lib/api";

type State = "confirming" | "done" | "expired" | "signed-out" | "error";

/**
 * Completes the two-step email change: the user arrives from the message sent
 * to the NEW address, carrying the single-use token, which we submit for them.
 *
 * Unlike /verify-email/confirm this endpoint needs the SESSION too — the token
 * proves the mailbox, the session proves whose account it is — so a signed-out
 * reader gets a sign-in prompt rather than a dead end, and the token stays in
 * the URL so returning here finishes the job.
 */
export function ConfirmEmailChangeForm({ token }: { token: string }) {
  const { status, reloadUser } = useSession();
  // "confirming" is the initial state rather than something the effect sets:
  // setting state synchronously inside an effect is exactly what the
  // react-hooks lint rule forbids, so every transition below happens from a
  // settled promise. Whether we are actually confirming is decided by the
  // render guards (no token / still restoring / signed out), not by this value.
  const [state, setState] = useState<State>("confirming");
  const [email, setEmail] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    // Wait for the boot-time refresh to settle, and never submit while signed
    // out: a single-use token spent on a request with no bearer token is gone
    // for good.
    if (status !== "authed") return;
    ran.current = true; // guard the double-invoke in React strict mode (dev)
    authApi
      .confirmEmailChange({ token })
      .then(async (res) => {
        setEmail(res.email);
        setState("done");
        try {
          await reloadUser();
        } catch {
          // ignore — the change itself already succeeded
        }
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          ran.current = false;
          setState("signed-out");
          return;
        }
        setState(err instanceof ApiError && (err.status === 400 || err.status === 409) ? "expired" : "error");
      });
  }, [token, status, reloadUser]);

  if (!token) {
    return <InvalidLink />;
  }

  // Signed out (or still restoring): the token stays in the URL, so coming back
  // here after signing in finishes the job.
  if (status !== "authed" && state !== "done") {
    return status === "restoring" ? <Confirming /> : <SignInPrompt />;
  }

  if (state === "signed-out") {
    return <SignInPrompt />;
  }

  if (state === "confirming") {
    return <Confirming />;
  }

  if (state === "done") {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="success">
          Your email address is now {email}. We told your previous address about the change.
        </Alert>
        <p className="text-center text-sm text-fg-muted">
          <Link
            href="/settings/security"
            className="focus-ring rounded-sm font-semibold text-accent-text transition-opacity hover:opacity-80"
          >
            Back to security settings
          </Link>
        </p>
      </div>
    );
  }

  if (state === "expired") {
    return <InvalidLink />;
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert>Something went wrong confirming your new address. Please try again.</Alert>
      <p className="text-center text-sm text-fg-muted">
        <Link
          href="/settings/security"
          className="focus-ring rounded-sm font-semibold text-accent-text transition-opacity hover:opacity-80"
        >
          Security settings
        </Link>
      </p>
    </div>
  );
}

function Confirming() {
  return (
    <div className="flex items-center justify-center gap-3 py-4">
      <Spinner label="Confirming" />
      <p className="text-sm text-fg-muted">Confirming your new email address…</p>
    </div>
  );
}

function SignInPrompt() {
  return (
    <div className="flex flex-col gap-4">
      <Alert>
        Sign in to the account you are moving, then open this link again — confirming needs both the
        link and the account.
      </Alert>
      <p className="text-center text-sm text-fg-muted">
        <Link
          href="/login"
          className="focus-ring rounded-sm font-semibold text-accent-text transition-opacity hover:opacity-80"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}

function InvalidLink() {
  return (
    <div className="flex flex-col gap-4">
      <Alert>
        This confirmation link is invalid, already used, or has expired. Ask for a new one from your
        security settings.
      </Alert>
      <p className="text-center text-sm text-fg-muted">
        <Link
          href="/settings/security"
          className="focus-ring rounded-sm font-semibold text-accent-text transition-opacity hover:opacity-80"
        >
          Security settings
        </Link>
      </p>
    </div>
  );
}
