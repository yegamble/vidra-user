"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { AuthWordmark } from "@/components/auth/AuthPage";
import { useSession } from "@/components/auth/AuthProvider";
import { CheckIcon, InfoIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { LinkButton } from "@/components/ui/LinkButton";
import { ApiError, errorMessage, fieldErrors } from "@/lib/api";
import { getInstanceCached, invalidateInstanceCache } from "@/lib/api/instance-platform";
import {
  OWNER_CLAIM_INVALID_CODE,
  OWNER_CLAIM_LOG_COMMAND,
  OWNER_CLAIM_LOG_MARKER,
} from "@/lib/owner-claim";

// ClaimOwnerForm — the first-run wizard. One screen, two states:
//
//   1. the form: the setup token from the server's startup log plus the owner
//      account's own details (username / email / password, confirmed);
//   2. the finished state: the owner is ALREADY signed in (the claim's 201 body
//      is an AuthResponse, applied through the same seam as a login), so the
//      only thing left is where to go next.
//
// The page above this component already redirects a server that reports it has
// an owner. That check runs against the server-rendered instance snapshot,
// which is null whenever the backend could not be read at render time — so
// this component repeats it in the browser and leaves for home if the live
// document says the claim is settled. Belt and braces: a wizard nobody can use
// should never be reachable.

export function ClaimOwnerForm({
  /** True when a turned-away signup attempt sent the visitor here. */
  fromSignup = false,
}: {
  fromSignup?: boolean;
}) {
  const router = useRouter();
  const { claimOwner } = useSession();
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrs, setFieldErrs] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<ReactNode>(null);
  const [submitting, setSubmitting] = useState(false);
  const [claimed, setClaimed] = useState(false);

  // Live re-check of the first-run signal (see the note above). Skipped once
  // the claim has landed: the server then correctly reports "no longer
  // pending", and that answer must not bounce the owner off their own
  // confirmation screen.
  useEffect(() => {
    if (claimed) return;
    let cancelled = false;
    getInstanceCached()
      .then((instance) => {
        if (!cancelled && instance.owner_claim_pending === false) router.replace("/");
      })
      .catch(() => {
        // Unreadable instance document: keep the wizard. A claim attempt gets
        // the honest answer from the server itself.
      });
    return () => {
      cancelled = true;
    };
  }, [claimed, router]);

  async function submit() {
    setFieldErrs({});
    setFormError(null);
    if (password !== confirmPassword) {
      setFieldErrs({ confirm_password: "Both passwords need to match." });
      return;
    }
    setSubmitting(true);
    try {
      await claimOwner({
        token: token.trim(),
        username: username.trim(),
        email: email.trim(),
        password,
      });
      // The server is no longer waiting for an owner: drop the cached instance
      // document so any client-side navigation from here reads the new state
      // immediately (server-rendered surfaces catch up within the snapshot's
      // ~60s window, which is fine — the owner is already past them).
      invalidateInstanceCache();
      setClaimed(true);
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiError && err.code === OWNER_CLAIM_INVALID_CODE) {
        setFormError(<StaleTokenHelp />);
        return;
      }
      if (err instanceof ApiError && err.status === 409) {
        setFormError(<AlreadyTakenHelp />);
        return;
      }
      const fields = fieldErrors(err);
      if (fields) {
        setFieldErrs(fields);
        return;
      }
      setFormError(
        errorMessage(err, "Could not finish setting up your server. Please try again."),
      );
    }
  }

  if (claimed) return <ClaimedState username={username.trim()} />;

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-4"
    >
      <div className="mb-2 flex flex-col items-center gap-3 text-center">
        <h1>
          <AuthWordmark brandClassName="text-[30px]" />
        </h1>
        <p className="text-title2 text-fg">Finish setting up your server</p>
        <p className="text-subhead text-fg-muted">
          Create the owner account. It is the first account here, and the only one that can
          invite, moderate, and change how this server runs.
        </p>
      </div>

      {fromSignup ? (
        <p className="flex items-start gap-2.5 rounded-xl bg-surface-muted px-3.5 py-3 text-[13px] leading-relaxed text-fg-muted">
          <InfoIcon size={14} strokeWidth={2} className="mt-0.5 shrink-0" />
          Sign-ups are on hold until this server has an owner. If this server is yours, finish
          setting it up here — otherwise ask whoever runs it to.
        </p>
      ) : null}

      {formError ? (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-xl border border-danger-border bg-danger-surface px-3.5 py-3 text-sm text-danger"
        >
          {formError}
        </div>
      ) : null}

      <Input
        id="claim-token"
        name="claim-token"
        type="password"
        label="Setup token"
        autoComplete="off"
        spellCheck={false}
        autoFocus
        required
        value={token}
        onChange={(e) => setToken(e.target.value)}
        error={fieldErrs.token}
        hint="Your server printed this when it started. A restart replaces it with a new one."
        className="min-h-12 font-mono text-base"
      />

      <Input
        id="claim-username"
        name="claim-username"
        type="text"
        label="Username"
        autoComplete="username"
        required
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        error={fieldErrs.username}
        className="min-h-12 text-base"
      />

      <Input
        id="claim-email"
        name="claim-email"
        type="email"
        label="Email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={fieldErrs.email}
        className="min-h-12 text-base"
      />

      <Input
        id="claim-password"
        name="claim-password"
        type="password"
        label="Password"
        autoComplete="new-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={fieldErrs.password}
        hint="At least 8 characters."
        className="min-h-12 text-base"
      />

      <Input
        id="claim-confirm-password"
        name="claim-confirm-password"
        type="password"
        label="Confirm password"
        autoComplete="new-password"
        required
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        error={fieldErrs.confirm_password}
        className="min-h-12 text-base"
      />

      <Button type="submit" size="lg" className="w-full" disabled={submitting}>
        {submitting ? "Creating the owner account…" : "Create the owner account"}
      </Button>

      <p className="text-center text-subhead text-fg-muted">
        Already the owner?{" "}
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

/**
 * The invalid-token state — by far the most likely failure, and the one people
 * cannot diagnose on their own: the server mints a NEW setup token every time
 * it restarts, so a token copied from an earlier startup is already dead. The
 * backend deliberately answers the same way for a wrong, a spent, and a stale
 * token (it must not become an oracle), so the copy covers all three and hands
 * over the command that prints the current one.
 */
function StaleTokenHelp() {
  return (
    <>
      <p className="font-semibold">That setup token was not accepted.</p>
      <p className="text-fg-muted">
        Your server issues a new setup token every time it restarts, and only the newest one
        works. Read the current one from your server&apos;s log:
      </p>
      <code className="block overflow-x-auto rounded-lg bg-surface-muted px-3 py-2 font-mono text-[13px] text-fg">
        {OWNER_CLAIM_LOG_COMMAND}
      </code>
      <p className="text-fg-muted">
        Look for the line beginning &ldquo;{OWNER_CLAIM_LOG_MARKER}&rdquo; and copy the token
        beside it. If someone has already set this server up, sign in instead.
      </p>
    </>
  );
}

/** 409 — the chosen username or email is spoken for. */
function AlreadyTakenHelp() {
  return (
    <>
      <p className="font-semibold">Someone finished setting up this server first.</p>
      <p className="text-fg-muted">
        That username or email is already in use here, so the account could not be created.
        If it is yours,{" "}
        <Link href="/login" className="font-semibold underline underline-offset-2">
          sign in
        </Link>
        ; otherwise pick a different username and email.
      </p>
    </>
  );
}

/** The finished state: the owner is signed in already — just say where to go. */
function ClaimedState({ username }: { username: string }) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <span
        aria-hidden="true"
        className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent/12 text-accent"
      >
        <CheckIcon size={24} />
      </span>
      <h1 className="text-title text-fg">Your server is ready</h1>
      <p className="text-subhead text-fg-muted">
        {username ? `You are signed in as ${username}. ` : "You are signed in. "}
        This server is yours to run — set who can join, add channels, and start publishing.
      </p>
      <div className="mt-2 flex w-full flex-col gap-2.5">
        <LinkButton href="/admin" size="lg" className="w-full">
          Open your server settings
        </LinkButton>
        <LinkButton href="/" size="lg" variant="tonal" className="w-full">
          Go to the home page
        </LinkButton>
      </div>
    </div>
  );
}
