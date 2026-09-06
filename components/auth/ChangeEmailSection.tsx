"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { Alert } from "@/components/ui/Alert";
import { ApiError, authApi, errorMessage } from "@/lib/api";
import type { EmailChangeState } from "@/lib/api";

/**
 * ChangeEmailSection is the /settings/security front for the two-step email
 * change (POST/GET/DELETE /api/v1/auth/me/email-change + …/confirm). Before it,
 * an account's address was fixed at registration — `PATCH /auth/me` 422s an
 * `email` and not even the instance owner could move one — so a user who lost
 * their mailbox lost password recovery permanently.
 *
 * It is deliberately two-step in the UI as well as the API: asking changes
 * nothing, and the card then shows the PENDING address with resend and cancel,
 * because "we sent a link to an address you cannot read" is the one state where
 * a user needs a way out.
 *
 * The typed password lives in component state, is cleared on success, and is
 * never logged or put in a URL.
 */
export function ChangeEmailSection() {
  const { user } = useSession();
  const titleId = useId();
  const emailId = useId();
  const passwordId = useId();

  const [pending, setPending] = useState<EmailChangeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<React.ReactNode | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // The promise-chain form, matching the two-factor card above: no state is set
  // synchronously inside the effect, only from the settled promise.
  useEffect(() => {
    const controller = new AbortController();
    authApi
      .getEmailChange(controller.signal)
      .then((state) => {
        setPending(state);
        setLoading(false);
      })
      .catch(() => {
        // A failed read must not blank the card: the form below still works,
        // and the server refuses anything the client got wrong.
        if (!controller.signal.aborted) {
          setPending(null);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, []);

  async function submit() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const state = await authApi.requestEmailChange({
        current_password: password,
        new_email: newEmail.trim(),
      });
      setPending(state);
      setNewEmail("");
      setPassword("");
      setNotice(`Confirm the change from the message we sent to ${state.new_email}.`);
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const state = await authApi.resendEmailChange();
      setPending(state);
      setNotice(`We sent another confirmation to ${state.new_email}. The earlier link no longer works.`);
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await authApi.cancelEmailChange();
      setPending({ pending: false });
      setNotice("The pending change was cancelled, and its confirmation link no longer works.");
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  }

  const isPending = pending?.pending === true;

  return (
    // A named region for the same reason the Password card is one: this page
    // carries several password inputs, and the section name is what tells them
    // apart to a screen reader.
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface p-4"
    >
      <div className="flex flex-col gap-1">
        <h2 id={titleId} className="text-base font-semibold tracking-tight text-fg">
          Email
        </h2>
        <p className="text-sm text-fg-muted">
          Your address is how you sign in and how you recover the account. Changing it needs your
          password and a confirmation sent to the new address.
        </p>
      </div>

      <p className="text-sm text-fg">
        Current address:{" "}
        <span className="font-medium">{user?.email ?? "—"}</span>
        {user?.email_verified === false ? (
          <span className="text-fg-muted"> (unverified)</span>
        ) : null}
      </p>

      {error ? <Alert as="div">{error}</Alert> : null}
      {notice ? (
        <Alert variant="success" as="div">
          {notice}
        </Alert>
      ) : null}

      {loading ? null : isPending ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-fg">
            Waiting for confirmation at{" "}
            <span className="font-medium">{pending?.new_email}</span>. Your address does not change
            until that link is used.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void resend()}
              className="focus-ring rounded-full border border-border px-4 py-2 text-sm font-semibold text-fg transition-colors hover:bg-surface-raised disabled:opacity-60"
            >
              Resend confirmation
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void cancel()}
              className="focus-ring rounded-full border border-border px-4 py-2 text-sm font-semibold text-fg transition-colors hover:bg-surface-raised disabled:opacity-60"
            >
              Cancel change
            </button>
          </div>
        </div>
      ) : (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor={emailId} className="text-sm font-medium text-fg">
              New email address
            </label>
            <input
              id={emailId}
              name={emailId}
              type="email"
              autoComplete="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="focus-ring w-full max-w-sm rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={passwordId} className="text-sm font-medium text-fg">
              Current password
            </label>
            <input
              id={passwordId}
              name={passwordId}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="focus-ring w-full max-w-sm rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg"
            />
          </div>
          <button
            type="submit"
            disabled={busy || newEmail === "" || password === ""}
            className="focus-ring self-start rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent/90 disabled:opacity-60"
          >
            {busy ? "Sending…" : "Send confirmation"}
          </button>
        </form>
      )}
    </section>
  );
}

// describe turns the shipped refusals into sentences that say what to do. The
// two 409s are different problems and must not read the same.
function describe(err: unknown): React.ReactNode {
  if (err instanceof ApiError) {
    if (err.status === 403) return "That is not your current password.";
    if (err.status === 409) {
      // The password-less (OAuth/ATProto-only) shape says "reset"; the taken
      // address does not. The server's own sentence is the discriminator.
      if (/reset/i.test(err.message)) {
        return (
          <>
            This account signs in without a password, so there is none to confirm with. Use{" "}
            <Link href="/reset-password" className="focus-ring rounded-sm font-semibold underline">
              password reset
            </Link>{" "}
            to set one first.
          </>
        );
      }
      return "That email address is already in use on this instance.";
    }
    if (err.status === 422) return errorMessage(err);
    if (err.status === 404) return "There is no pending change any more. Reload to see the latest.";
  }
  return errorMessage(err);
}
