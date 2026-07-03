"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { OAuthButtons, oauthErrorMessage } from "@/components/auth/OAuthButtons";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { ApiError, api } from "@/lib/api";

type RegState = "loading" | "open" | "closed";

export function SignupForm({
  oauthPending = false,
  oauthError = "",
}: {
  /** True when the URL carried the ?oauth=1 return_to marker. */
  oauthPending?: boolean;
  /** The ?oauth_error=<code> from a failed OAuth callback ("" when none). */
  oauthError?: string;
}) {
  const router = useRouter();
  const { status, register } = useSession();

  const [regState, setRegState] = useState<RegState>("loading");
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [providers, setProviders] = useState<string[]>([]);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [note, setNote] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(
    oauthError ? oauthErrorMessage(oauthError) : null,
  );
  const [submitting, setSubmitting] = useState(false);
  // Set when register answered 202: the signup awaits admin approval.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  // Sticky OAuth-landing marker (see LoginForm): while the boot silent-refresh
  // decides, a spinner shows; a settled "anon" is surfaced as an honest error.
  const [oauthLanding] = useState(oauthPending && !oauthError);
  const [landingDismissed, setLandingDismissed] = useState(false);
  const completingOAuth = oauthLanding && !landingDismissed && status === "restoring";
  const oauthSilentFailure = oauthLanding && !landingDismissed && status === "anon";

  // Clean the one-shot OAuth markers out of the URL.
  useEffect(() => {
    if (oauthPending || oauthError) router.replace("/signup");
  }, [oauthPending, oauthError, router]);

  // A successful OAuth landing: the silent refresh picked up the session
  // cookie the callback set — leave the signup page.
  useEffect(() => {
    if (oauthLanding && status === "authed") router.replace("/");
  }, [oauthLanding, status, router]);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getInstance(controller.signal)
      .then((instance) => {
        setRequiresApproval(instance.registration_requires_approval === true);
        setProviders(instance.oauth_providers ?? []);
        setRegState(instance.registration_enabled ? "open" : "closed");
      })
      .catch(() => {
        // If we cannot read instance config, show the form and let the register
        // attempt surface the real outcome rather than blocking signup.
        if (!controller.signal.aborted) setRegState("open");
      });
    return () => controller.abort();
  }, []);

  async function submit() {
    setFieldErrors({});
    setFormError(null);
    setLandingDismissed(true); // a manual attempt supersedes the OAuth landing
    setSubmitting(true);
    try {
      const outcome = await register({
        username,
        email,
        password,
        note: note.trim() || undefined,
      });
      if (outcome === "pending") {
        // The instance requires approval: no account/session exists yet — show
        // the awaiting-approval confirmation instead of navigating home signed in.
        setPendingEmail(email);
        return;
      }
      router.push("/");
    } catch (err) {
      if (err instanceof ApiError && err.fields && err.fields.length > 0) {
        const map: Record<string, string> = {};
        for (const f of err.fields) map[f.field] = f.message;
        setFieldErrors(map);
      } else if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
      setSubmitting(false);
    }
  }

  if (pendingEmail) {
    return (
      <EmptyState
        title="Your account is awaiting approval"
        message={
          <>
            Your signup was sent to the administrators of this instance for review. Once it is
            approved you can{" "}
            <Link href="/login" className="underline hover:text-zinc-700 dark:hover:text-zinc-200">
              sign in
            </Link>{" "}
            as <span className="font-medium">{pendingEmail}</span>. No account exists until then.
          </>
        }
      />
    );
  }

  if (completingOAuth) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label="Completing sign-in" />
      </div>
    );
  }

  if (regState === "loading") {
    return (
      <div className="flex justify-center py-12">
        <Spinner label="Loading" />
      </div>
    );
  }
  const displayFormError =
    formError ??
    (oauthSilentFailure
      ? "Could not complete the sign-in with the provider. Please try again."
      : null);

  if (regState === "closed") {
    return (
      <EmptyState
        title="Registration is closed"
        message={
          <>
            This instance is not accepting new accounts right now.{" "}
            <Link href="/login" className="underline hover:text-zinc-700 dark:hover:text-zinc-200">
              Sign in
            </Link>{" "}
            instead.
          </>
        }
      />
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
      {displayFormError ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
        >
          {displayFormError}
        </p>
      ) : null}

      <Input
        id="signup-username"
        name="signup-username"
        label="Username"
        type="text"
        autoComplete="username"
        required
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        error={fieldErrors.username}
      />
      <Input
        id="signup-email"
        name="signup-email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={fieldErrors.email}
      />
      <Input
        id="signup-password"
        name="signup-password"
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={fieldErrors.password}
      />

      {requiresApproval ? (
        <Textarea
          id="signup-note"
          name="signup-note"
          label="Message to the administrators (optional)"
          rows={3}
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      ) : null}

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? "Creating account…" : "Create account"}
      </Button>

      {requiresApproval ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          New accounts on this instance require administrator approval. Your signup will be
          reviewed before you can sign in.
        </p>
      ) : null}

      <OAuthButtons providers={providers} returnTo="/signup?oauth=1" />

      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Already have an account?{" "}
        <Link href="/login" className="underline hover:text-zinc-700 dark:hover:text-zinc-200">
          Sign in
        </Link>
      </p>
    </form>
  );
}
