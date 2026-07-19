"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { BlueskyLoginButton } from "@/components/auth/BlueskyLoginButton";
import { AuthOrDivider, OAuthButtons, oauthErrorMessage } from "@/components/auth/OAuthButtons";
import { ClockIcon, InfoIcon, MailIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { InstanceResponse } from "@/lib/api";

type RegState = "loading" | "open" | "closed";

export function SignupForm({
  oauthPending = false,
  oauthError = "",
  initialInstance,
}: {
  /** True when the URL carried the ?oauth=1 return_to marker. */
  oauthPending?: boolean;
  /** The ?oauth_error=<code> from a failed OAuth callback ("" when none). */
  oauthError?: string;
  /** SSR snapshot; undefined keeps the resilient browser-fetch fallback. */
  initialInstance?: InstanceResponse;
}) {
  const router = useRouter();
  const { status, register } = useSession();

  const [regState, setRegState] = useState<RegState>(() =>
    initialInstance ? (initialInstance.registration_enabled ? "open" : "closed") : "loading",
  );
  const [requiresApproval, setRequiresApproval] = useState(
    initialInstance?.registration_requires_approval === true,
  );
  // W7 signup-policy fields from GET /instance: the effective
  // email-verification gate, the age-attestation threshold (0 = off), and the
  // machine-readable closure reason ("user_limit_reached" when the instance
  // is full).
  const [requiresVerification, setRequiresVerification] = useState(
    initialInstance?.registration_requires_email_verification === true,
  );
  const [minimumAge, setMinimumAge] = useState(initialInstance?.registration_minimum_age ?? 0);
  const [closedReason, setClosedReason] = useState(
    initialInstance?.registration_disabled_reason ?? "",
  );
  const [providers, setProviders] = useState<string[]>(initialInstance?.oauth_providers ?? []);
  const [atprotoEnabled, setAtprotoEnabled] = useState(initialInstance?.atproto_login === true);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [note, setNote] = useState("");
  const [ageAttested, setAgeAttested] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(
    oauthError ? oauthErrorMessage(oauthError) : null,
  );
  const [submitting, setSubmitting] = useState(false);
  // Set when register answered 202: the signup awaits admin approval, or the
  // account is held until its email is verified (W7).
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [pendingKind, setPendingKind] = useState<"approval" | "verification">("approval");
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
        setRequiresVerification(instance.registration_requires_email_verification === true);
        setMinimumAge(instance.registration_minimum_age ?? 0);
        setClosedReason(instance.registration_disabled_reason ?? "");
        setProviders(instance.oauth_providers ?? []);
        setAtprotoEnabled(instance.atproto_login ?? false);
        setRegState(instance.registration_enabled ? "open" : "closed");
      })
      .catch(() => {
        // If we cannot read instance config, show the form and let the register
        // attempt surface the real outcome rather than blocking signup.
        if (!controller.signal.aborted && initialInstance === undefined) setRegState("open");
      });
    return () => controller.abort();
  }, [initialInstance]);

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
        age_attestation: minimumAge > 0 ? ageAttested : undefined,
      });
      if (outcome === "pending" || outcome === "verification_pending") {
        // No session yet: the signup awaits admin approval, or the account is
        // held until the emailed verification link is confirmed (W7) — show
        // the matching confirmation instead of navigating home signed in.
        setPendingKind(outcome === "verification_pending" ? "verification" : "approval");
        setPendingEmail(email);
        return;
      }
      router.push("/");
    } catch (err) {
      if (err instanceof ApiError && err.fields && err.fields.length > 0) {
        const map: Record<string, string> = {};
        for (const f of err.fields) map[f.field] = f.message;
        setFieldErrors(map);
      } else {
        // A 409 conflict has no field list — the username or email is taken.
        setFormError(
          errorMessage(err, "Something went wrong. Please try again.", {
            conflict: "That username or email is already taken.",
          }),
        );
      }
      setSubmitting(false);
    }
  }

  if (pendingEmail) {
    if (pendingKind === "verification") {
      return (
        <EmptyState
          icon={<MailIcon size={24} />}
          title="Check your email"
          message={
            <>
              We sent a verification link to <span className="font-medium">{pendingEmail}</span>.
              Follow it to activate your account, then{" "}
              <Link href="/login" className="focus-ring rounded-sm font-semibold text-fg underline underline-offset-2">
                sign in
              </Link>
              . You cannot sign in until your email is verified.
            </>
          }
        />
      );
    }
    return (
      <EmptyState
        icon={<ClockIcon size={24} />}
        tint="orange"
        title="Your account is awaiting approval"
        message={
          <>
            Your signup was sent to the administrators of this instance for review. Once it is
            approved you can{" "}
            <Link href="/login" className="focus-ring rounded-sm font-semibold text-fg underline underline-offset-2">
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
    // The user-limit closure gets honest copy (W7): the instance is full, not
    // deliberately closed by policy.
    const limitReached = closedReason === "user_limit_reached";
    return (
      <EmptyState
        icon={<InfoIcon size={24} />}
        tint="gray"
        title={limitReached ? "This instance is full" : "Registration is closed"}
        message={
          <>
            {limitReached
              ? "This instance has reached its maximum number of accounts and cannot accept new signups right now."
              : "This instance is not accepting new accounts right now."}{" "}
            <Link href="/login" className="focus-ring rounded-sm font-semibold text-fg underline underline-offset-2">
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
          className="rounded-xl border border-danger-border bg-danger-surface px-3.5 py-2.5 text-sm text-danger"
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
        className="min-h-12 text-base"
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
        className="min-h-12 text-base"
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
        className="min-h-12 text-base"
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

      {minimumAge > 0 ? (
        <div className="flex items-start gap-2.5">
          <input
            id="signup-age-attestation"
            name="signup-age-attestation"
            type="checkbox"
            checked={ageAttested}
            onChange={(e) => setAgeAttested(e.target.checked)}
            aria-invalid={fieldErrors.age_attestation ? true : undefined}
            aria-describedby={fieldErrors.age_attestation ? "signup-age-attestation-error" : undefined}
            className="focus-ring mt-0.5 h-4 w-4 rounded border-border accent-accent"
          />
          <div className="flex flex-col">
            <label htmlFor="signup-age-attestation" className="text-sm font-medium text-fg">
              I am at least {minimumAge} years old
            </label>
            {fieldErrors.age_attestation ? (
              <p id="signup-age-attestation-error" className="text-xs text-danger">
                {fieldErrors.age_attestation}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={submitting}>
        {submitting ? "Creating account…" : "Create account"}
      </Button>

      {requiresApproval ? (
        <p className="flex items-start gap-2.5 rounded-xl bg-surface-muted px-3.5 py-3 text-[13px] leading-relaxed text-fg-muted">
          <InfoIcon size={14} strokeWidth={2} className="mt-0.5 shrink-0" />
          New accounts on this instance require administrator approval. Your signup will be
          reviewed before you can sign in.
        </p>
      ) : null}

      {requiresVerification ? (
        <p className="flex items-start gap-2.5 rounded-xl bg-surface-muted px-3.5 py-3 text-[13px] leading-relaxed text-fg-muted">
          <InfoIcon size={14} strokeWidth={2} className="mt-0.5 shrink-0" />
          This instance requires email verification. After signing up, follow the link we email
          you before you can sign in.
        </p>
      ) : null}

      {/* Single "or" rule for the alternative-auth group (see LoginForm). The
          ATProto callback appends ?oauth=1 to a BARE return_to itself, so the
          Bluesky button passes "/signup" (not "/signup?oauth=1"). */}
      {providers.length === 0 && atprotoEnabled ? <AuthOrDivider /> : null}
      <OAuthButtons providers={providers} returnTo="/signup?oauth=1" />
      <BlueskyLoginButton enabled={atprotoEnabled} returnTo="/signup" />

      <p className="text-center text-subhead text-fg-muted">
        Already have an account?{" "}
        <Link
          href="/login"
          className="focus-ring rounded-sm font-semibold text-accent-text transition-opacity hover:opacity-80"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
