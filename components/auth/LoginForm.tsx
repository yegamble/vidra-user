"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { OAuthButtons, oauthErrorMessage } from "@/components/auth/OAuthButtons";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api } from "@/lib/api";

// LoginForm drives the whole sign-in surface:
//  - email/password credentials (cookie-mode session);
//  - the two-factor challenge swap-in when login answers {mfa_required,
//    mfa_token} — a TOTP or recovery code finishes the login;
//  - one "Continue with <Provider>" button per configured OIDC provider
//    (GET /instance oauth_providers), navigating top-level to the backend's
//    OAuth begin endpoint with return_to=/login?oauth=1;
//  - the OAuth landing: the callback issues the session as an httpOnly cookie
//    and redirects back here, so ?oauth=1 waits for the boot-time silent
//    refresh to settle (authed -> home) and ?oauth_error=<code> renders the
//    honest failure copy. Both markers are cleaned from the URL immediately.
export function LoginForm({
  oauthPending = false,
  oauthError = "",
}: {
  /** True when the URL carried the ?oauth=1 return_to marker. */
  oauthPending?: boolean;
  /** The ?oauth_error=<code> from a failed OAuth callback ("" when none). */
  oauthError?: string;
}) {
  const router = useRouter();
  const { status, login, completeMfaChallenge } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    oauthError ? oauthErrorMessage(oauthError) : null,
  );
  const [submitting, setSubmitting] = useState(false);
  // Set once login answers mfa_required: the form swaps to the code entry.
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  // Sticky OAuth-landing marker: initialised from the one-shot ?oauth=1 prop
  // so it survives the URL cleanup below. While the boot silent-refresh is
  // still deciding, the landing shows a spinner; a settled "anon" means the
  // callback did NOT hand us a session cookie — surfaced honestly (dismissed
  // once the user falls back to the password form).
  const [oauthLanding] = useState(oauthPending && !oauthError);
  const [landingDismissed, setLandingDismissed] = useState(false);
  const completingOAuth = oauthLanding && !landingDismissed && status === "restoring";
  const oauthSilentFailure = oauthLanding && !landingDismissed && status === "anon";
  const [providers, setProviders] = useState<string[]>([]);

  // Clean the one-shot OAuth markers out of the URL (they must not survive a
  // reload/bookmark); the outcome already lives in state.
  useEffect(() => {
    if (oauthPending || oauthError) router.replace("/login");
  }, [oauthPending, oauthError, router]);

  // A successful OAuth landing: the silent refresh picked up the session
  // cookie the callback set — leave the login page.
  useEffect(() => {
    if (oauthLanding && status === "authed") router.replace("/");
  }, [oauthLanding, status, router]);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getInstance(controller.signal)
      .then((instance) => setProviders(instance.oauth_providers ?? []))
      .catch(() => {
        // No instance document — the password form still works without buttons.
      });
    return () => controller.abort();
  }, []);

  async function submit() {
    setError(null);
    setLandingDismissed(true); // a manual attempt supersedes the OAuth landing
    setSubmitting(true);
    try {
      const outcome = await login({ email, password });
      if (outcome.status === "mfa_required") {
        // Valid credentials, but the account needs a second factor: no
        // session exists yet — swap to the code entry.
        setMfaToken(outcome.mfaToken);
        setSubmitting(false);
        return;
      }
      router.push("/");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status === 401
            ? "Invalid email or password."
            : err.message
          : "Something went wrong. Please try again.",
      );
      setSubmitting(false);
    }
  }

  async function submitChallenge() {
    if (!mfaToken) return;
    setError(null);
    setSubmitting(true);
    try {
      await completeMfaChallenge(mfaToken, code.trim());
      router.push("/");
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiError && err.status === 401) {
        setError(
          "That code didn't work, or this sign-in attempt has expired. Enter a fresh code, or go back and sign in again.",
        );
      } else if (err instanceof ApiError && err.status === 429) {
        setError("Too many attempts — wait a moment and try again.");
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    }
  }

  if (completingOAuth) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label="Completing sign-in" />
      </div>
    );
  }

  const displayError =
    error ??
    (oauthSilentFailure
      ? "Could not complete the sign-in with the provider. Please try again."
      : null);
  const errorBanner = displayError ? (
    <p
      role="alert"
      className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
    >
      {displayError}
    </p>
  ) : null;

  if (mfaToken) {
    return (
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submitChallenge();
        }}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">Two-factor authentication</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Enter the 6-digit code from your authenticator app, or one of your recovery codes.
          </p>
        </div>

        {errorBanner}

        <Input
          id="mfa-code"
          name="mfa-code"
          type="text"
          label="Authentication code"
          autoComplete="one-time-code"
          autoFocus
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />

        <Button type="submit" className="w-full" disabled={submitting || code.trim() === ""}>
          {submitting ? "Verifying…" : "Verify code"}
        </Button>

        <button
          type="button"
          onClick={() => {
            // The mfa_token is single-purpose and short-lived; dropping it
            // returns to a clean credentials form.
            setMfaToken(null);
            setCode("");
            setError(null);
          }}
          className="self-start text-sm text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          Back to sign in
        </button>
      </form>
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
      {errorBanner}

      <Input
        id="login-email"
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <div className="flex flex-col gap-1">
        <Input
          id="login-password"
          name="password"
          type="password"
          label="Password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Link
          href="/reset-password"
          className="self-start text-sm text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          Forgot your password?
        </Link>
      </div>

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? "Signing in…" : "Sign in"}
      </Button>

      <OAuthButtons providers={providers} returnTo="/login?oauth=1" />

      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        No account?{" "}
        <Link href="/signup" className="underline hover:text-zinc-700 dark:hover:text-zinc-200">
          Create one
        </Link>
      </p>
    </form>
  );
}
