"use client";

import { useState } from "react";

import { BlueskyIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, beginATProtoLogin } from "@/lib/api";

// BlueskyLoginButton is the ATProto identity-login affordance (GET /instance
// atproto_login). It collapses to a single "Continue with Bluesky" button;
// clicking it reveals a handle field (Bluesky or any self-hosted PDS). Submit
// POSTs /auth/atproto/start — which seals a signed httpOnly attempt cookie and
// returns the authorization URL — then hands off by a TOP-LEVEL navigation
// (never fetch). The backend callback lands the session as a cookie and
// redirects back to `returnTo` with ?oauth=1 (or ?oauth_error=<code>), which
// the existing LoginForm/SignupForm landing logic handles. Renders nothing
// when the feature is disabled.
export function BlueskyLoginButton({
  enabled,
  returnTo,
}: {
  enabled: boolean;
  returnTo: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!enabled) return null;

  if (!expanded) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="lg"
        className="w-full"
        onClick={() => setExpanded(true)}
      >
        <BlueskyIcon size={18} aria-hidden />
        Continue with Bluesky
      </Button>
    );
  }

  async function submit() {
    const trimmed = handle.trim();
    if (trimmed === "") {
      setError("Enter your Bluesky or ATProto handle.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const { authorization_url } = await beginATProtoLogin(trimmed, returnTo);
      // Top-level navigation ONLY: the begin call sealed the httpOnly attempt
      // cookie and this hands the browser off to the authorization server.
      // Never fetch authorization_url.
      window.location.assign(authorization_url);
    } catch (err) {
      setError(startErrorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-3"
    >
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-danger-border bg-danger-surface px-3.5 py-2.5 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}

      <Input
        id="atproto-login-handle"
        name="atproto-login-handle"
        type="text"
        label="Bluesky or ATProto handle"
        placeholder="alice.bsky.social"
        autoFocus
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="username"
        spellCheck={false}
        maxLength={253}
        value={handle}
        onChange={(e) => {
          setHandle(e.target.value);
          setError(null);
        }}
      />

      <Button type="submit" size="lg" className="w-full" disabled={submitting}>
        {submitting ? <Spinner label="Starting sign-in" /> : "Continue"}
      </Button>
    </form>
  );
}

/**
 * Honest copy for a failed /auth/atproto/start call. The endpoint answers 422
 * for a malformed handle, 502 when the PDS / authorization server could not be
 * reached, and 503 when the instance has ATProto login turned off; anything
 * else (network, unexpected) gets the generic retry line.
 */
function startErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.status) {
      case 422:
        return "That doesn't look like a valid handle.";
      case 502:
        return "Could not reach your Bluesky server. Try again shortly.";
      case 503:
        return "Bluesky sign-in is not enabled on this instance.";
    }
  }
  return "Could not start Bluesky sign-in. Please try again.";
}
