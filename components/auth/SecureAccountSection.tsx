"use client";

import { useCallback, useEffect, useId, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { providerDisplayName } from "@/components/auth/OAuthButtons";
import { Alert } from "@/components/ui/Alert";
import { ApiError, authApi, errorMessage } from "@/lib/api";
import type { OAuthIdentity } from "@/lib/api";
import { useSettledSession } from "@/lib/use-settled-session";

/**
 * SecureAccountSection — "Finish securing your account".
 *
 * An account created by signing in with Bluesky (or an OIDC provider) has
 * exactly ONE way in and no way to a second. It is passwordless, so the
 * password change has nothing to re-verify; and its address is a synthetic
 * `did-plc-…@atproto.invalid` name that can never receive mail, so the reset
 * link has nowhere to go. The refusal that protects that single credential even
 * says "set a password first" — which, until the step-up shipped, no path
 * allowed. Lose the Bluesky account and this one goes with it.
 *
 * The card is the reachable remedy, and it is deliberately a PROMPT rather than
 * a buried form: the user cannot discover this problem any other way, and by
 * the time they do it is too late to fix.
 *
 * The mechanics, because they are unusual:
 *
 *  1. Each action starts a step-up — a fresh round trip through the provider
 *     that is already this account's credential — with `return_to` carrying
 *     which action asked, so the browser lands back here knowing what to show.
 *  2. The callback returns `?step_up=<token>`. It is read once on mount and
 *     STRIPPED from the URL with history.replaceState, so it does not survive a
 *     copied link or a shared screen. It is worthless elsewhere anyway (bound to
 *     this session, single-use, ten minutes) — stripping it is hygiene, not the
 *     defence.
 *  3. That token authorises exactly one write: setting the first password, or
 *     starting the email change. Neither is spent until the user submits.
 */
export function SecureAccountSection({
  stepUp = "",
  stepUpError = "",
  secure = "",
}: {
  /** The `?step_up=<token>` the provider callback landed with. */
  stepUp?: string;
  /** The `?step_up_error=<code>` it landed with instead, on failure. */
  stepUpError?: string;
  /** Which action asked for the assertion — it rode in `return_to`. */
  secure?: string;
}) {
  const { user, reloadUser } = useSession();
  const { settled, authed, viewerKey } = useSettledSession();

  const [identities, setIdentities] = useState<OAuthIdentity[] | null>(null);
  // The landing values are PROPS, read server-side from the query the way the
  // login page reads ?oauth_error — not scraped out of window.location in an
  // effect, which would be a synchronous setState in an effect and a hydration
  // mismatch besides. State only tracks what the user does from here.
  const [spentToken, setSpentToken] = useState(false);
  const [action, setAction] = useState<SecureAction | null>(
    secure === "password" || secure === "email" ? secure : null,
  );
  // Which steps finished in THIS visit. It exists so the confirmation survives:
  // reloadUser flips has_password server-side, which would otherwise make the
  // row — and sometimes the whole card — vanish the instant it succeeded,
  // leaving the user with no evidence that anything happened.
  const [completed, setCompleted] = useState<SecureAction[]>([]);

  // Derived before the effects so the identity read can be conditional on the
  // card applying at all: an account with a password and a real address has
  // nothing to prompt about, and must not spend a request finding that out.
  const needsPassword = user?.has_password === false;
  const needsEmail = user?.email_placeholder === true;
  // A step-up is a SUBSTITUTE for a password, so core refuses one from an
  // account that has a password: `POST /auth/me/email-change` with a
  // step_up_token answers 422 password_already_set. Measured in the lab by
  // taking the two rows in the order this card lists them — set a password,
  // then add an address — which made the second row a button that could only
  // ever fail. Once there is a password, the ordinary Change-email control on
  // this same page is the door, and the card says so instead of offering a
  // challenge whose result cannot be spent.
  const emailNeedsThePasswordDoor = needsEmail && user?.has_password === true;
  const applies = needsPassword || needsEmail || completed.length > 0;
  const stepUpToken = spentToken || stepUp === "" ? null : stepUp;
  const landingError = stepUpError === "" ? null : stepUpErrorMessage(stepUpError);

  // The linked identities are a VIEWER-SCOPED read, so it waits for the session
  // to settle: fired from a bare mount effect it would leave without the
  // Authorization header (the access token is redeemed asynchronously from the
  // httpOnly refresh cookie) and come back 401, and the effect would never
  // re-run.
  useEffect(() => {
    if (!applies || !settled || !authed) return;
    const controller = new AbortController();
    authApi
      .listOAuthIdentities(controller.signal)
      .then((res) => setIdentities(res.identities))
      .catch((err) => {
        if (controller.signal.aborted) return;
        // 404 = this instance mounts no identity routes at all, which means
        // there is no provider to step up with. An empty list is the honest
        // reading, and the card falls back to explaining rather than offering a
        // button that cannot work.
        setIdentities(err instanceof ApiError && err.status === 404 ? [] : []);
      });
    return () => controller.abort();
  }, [applies, settled, authed, viewerKey]);

  // Take the landing parameters back out of the address bar. This is an effect
  // that updates an EXTERNAL system (the browser's history entry) and sets no
  // React state, which is what an effect is for. The token is worthless
  // elsewhere anyway — bound to this session, single-use, ten minutes — so this
  // is hygiene against a copied link or a shared screen, not the defence.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has("step_up") && !params.has("step_up_error") && !params.has("secure")) return;
    params.delete("step_up");
    params.delete("step_up_error");
    params.delete("secure");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (query ? `?${query}` : "") + window.location.hash,
    );
  }, []);

  // Spending or abandoning an assertion takes the form away: the token is
  // single-use server-side, so leaving the form up would only offer the user a
  // guaranteed 403.
  const clearToken = useCallback(() => {
    setSpentToken(true);
    setAction(null);
  }, []);

  // Nothing to prompt about: this account already has both, and nothing was
  // just done here worth confirming.
  const showPassword = needsPassword || completed.includes("password");
  const showEmail = needsEmail || completed.includes("email");
  if (!user || (!showPassword && !showEmail)) return null;

  const markDone = (step: SecureAction) =>
    setCompleted((prev) => (prev.includes(step) ? prev : [...prev, step]));

  const provider = identities?.[0]?.provider ?? null;
  const providerLabel = provider ? providerDisplayName(provider) : "the account you sign in with";

  return (
    <section
      aria-labelledby="secure-account-title"
      className="flex flex-col gap-4 rounded-2xl border border-warning/40 bg-warning/10 p-4"
    >
      <div className="flex flex-col gap-1">
        <h2 id="secure-account-title" className="text-base font-semibold tracking-tight text-fg">
          Finish securing your account
        </h2>
        <p className="text-sm text-fg-muted">
          {needsPassword ? (
            <>
              You sign in with {providerLabel} and nothing else.{" "}
              <span className="font-medium text-fg">
                If you lose that account, you lose this one
              </span>{" "}
              — there is no password to fall back on.
            </>
          ) : (
            <>
              Your account has a password, but no address we can reach.{" "}
              <span className="font-medium text-fg">
                If you forget it, no reset link can be sent
              </span>{" "}
              — the address on file was generated for you and cannot receive mail.
            </>
          )}
          {needsEmail && needsPassword ? (
            <>
              {" "}
              The address on file was generated for you and cannot receive mail, so a reset link has
              nowhere to go either.
            </>
          ) : null}
        </p>
      </div>

      {landingError ? <Alert as="div">{landingError}</Alert> : null}

      {showPassword ? (
        <SecureStep
          title="Set a password"
          lead="A second way in, so this account survives losing the first."
          active={action === "password"}
          token={stepUpToken}
          provider={provider}
          onStart={() => setAction("password")}
          onCancel={clearToken}
        >
          {(token) => (
            <SetPasswordForm
              token={token}
              onDone={() => {
                markDone("password");
                void reloadUser();
              }}
            />
          )}
        </SecureStep>
      ) : null}

      {showEmail && emailNeedsThePasswordDoor && !completed.includes("email") ? (
        <div aria-labelledby="secure-email-by-password" className="flex flex-col gap-2 rounded-xl bg-surface p-3">
          <h3 id="secure-email-by-password" className="text-sm font-semibold text-fg">
            Add a real email address
          </h3>
          <p className="text-[13px] text-fg-muted">
            Now that this account has a password, change the address in{" "}
            <span className="font-medium text-fg">Email address</span> below and confirm it with
            that password. A provider sign-in cannot authorise this once a password exists.
          </p>
        </div>
      ) : showEmail ? (
        <SecureStep
          title="Add a real email address"
          lead="Where a password reset and any security notice can actually arrive."
          active={action === "email"}
          token={stepUpToken}
          provider={provider}
          onStart={() => setAction("email")}
          onCancel={clearToken}
        >
          {(token) => <AddEmailForm token={token} onDone={() => markDone("email")} />}
        </SecureStep>
      ) : null}
    </section>
  );
}

type SecureAction = "password" | "email";

/**
 * SecureStep is one row of the card, in whichever of its three states applies:
 * idle (a button), challenging (the provider handoff), or authorised (the form
 * the assertion unlocked). Splitting it this way keeps the two actions from
 * drifting apart on the part that is easy to get wrong — the handoff.
 */
function SecureStep({
  title,
  lead,
  active,
  token,
  provider,
  onStart,
  onCancel,
  children,
}: {
  title: string;
  lead: string;
  active: boolean;
  token: string | null;
  provider: string | null;
  onStart: () => void;
  onCancel: () => void;
  children: (token: string) => React.ReactNode;
}) {
  const titleId = useId();
  return (
    <div aria-labelledby={titleId} className="flex flex-col gap-2 rounded-xl bg-surface p-3">
      <div className="flex flex-col gap-0.5">
        <h3 id={titleId} className="text-sm font-semibold text-fg">
          {title}
        </h3>
        <p className="text-[13px] text-fg-muted">{lead}</p>
      </div>
      {active && token ? (
        <>
          {children(token)}
          <button
            type="button"
            onClick={onCancel}
            className="focus-ring self-start rounded-sm text-[13px] font-semibold text-fg hover:underline"
          >
            Cancel
          </button>
        </>
      ) : active ? (
        <StepUpChallenge provider={provider} action={title.startsWith("Set") ? "password" : "email"} onCancel={onCancel} />
      ) : (
        <button
          type="button"
          onClick={onStart}
          className="focus-ring self-start rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent/90"
        >
          {title}
        </button>
      )}
    </div>
  );
}

/**
 * StepUpChallenge hands the browser to the provider. The handoff MUST be a
 * top-level navigation: the start call sealed an httpOnly attempt cookie and
 * the authorization URL is for the browser, not for fetch.
 */
function StepUpChallenge({
  provider,
  action,
  onCancel,
}: {
  provider: string | null;
  action: SecureAction;
  onCancel: () => void;
}) {
  const handleId = useId();
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isATProto = provider === "atproto";

  if (!provider) {
    return (
      <Alert as="div">
        This account has no linked sign-in to confirm with, so there is nothing to step up through.
        Ask whoever runs this instance for help.
      </Alert>
    );
  }

  async function start() {
    setError(null);
    setBusy(true);
    try {
      const { authorization_url } = await authApi.startStepUp({
        provider: provider ?? "",
        handle: isATProto ? handle.trim() : undefined,
        // The action rides in return_to so the page knows, on the way back,
        // which form the assertion was collected for.
        return_to: `/settings/security?secure=${action}`,
      });
      window.location.assign(authorization_url);
    } catch (err) {
      setError(startErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-fg-muted">
        First, confirm it is you: sign in once more with {providerDisplayName(provider)}. You will
        come straight back here.
      </p>
      {error ? <Alert as="div">{error}</Alert> : null}
      {isATProto ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={handleId} className="text-sm font-medium text-fg">
            Your Bluesky or ATProto handle
          </label>
          <input
            id={handleId}
            name={handleId}
            type="text"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="alice.bsky.social"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            className="focus-ring w-full max-w-sm rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg"
          />
        </div>
      ) : null}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={busy || (isATProto && handle.trim() === "")}
          onClick={() => void start()}
          className="focus-ring rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent/90 disabled:opacity-60"
        >
          {busy ? "Starting…" : `Confirm with ${providerDisplayName(provider)}`}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="focus-ring rounded-sm text-[13px] font-semibold text-fg hover:underline"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

const MIN_PASSWORD_LENGTH = 8;

function SetPasswordForm({ token, onDone }: { token: string; onDone: () => void }) {
  const nextId = useId();
  const confirmId = useId();
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setError(null);
    // Client-only field: the API never sees it, so its mismatch is caught here
    // rather than spending a single-use assertion on a doomed request.
    if (next !== confirm) {
      setError("The passwords do not match.");
      return;
    }
    if (next.length < MIN_PASSWORD_LENGTH) {
      setError(`Your password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    setBusy(true);
    try {
      await authApi.setPassword({ new_password: next, step_up_token: token });
      setNext("");
      setConfirm("");
      setDone(true);
      onDone();
    } catch (err) {
      setError(writeErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Alert variant="success" as="div">
        Your password is set. Every other device was signed out; this one stays signed in.
      </Alert>
    );
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
      {error ? <Alert as="div">{error}</Alert> : null}
      <PasswordField id={nextId} label="New password" value={next} onChange={setNext} hint={`At least ${MIN_PASSWORD_LENGTH} characters.`} />
      <PasswordField id={confirmId} label="Confirm password" value={confirm} onChange={setConfirm} />
      <button
        type="submit"
        disabled={busy || next === "" || confirm === ""}
        className="focus-ring self-start rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent/90 disabled:opacity-60"
      >
        {busy ? "Saving…" : "Set password"}
      </button>
    </form>
  );
}

function AddEmailForm({ token, onDone }: { token: string; onDone: () => void }) {
  const emailId = useId();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const state = await authApi.requestEmailChange({
        step_up_token: token,
        new_email: email.trim(),
      });
      setSentTo(state.new_email ?? email.trim());
      onDone();
    } catch (err) {
      setError(writeErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <Alert variant="success" as="div">
        Confirm the change from the message we sent to {sentTo}. Your address does not move until
        that link is used.
      </Alert>
    );
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
      {error ? <Alert as="div">{error}</Alert> : null}
      <div className="flex flex-col gap-1">
        <label htmlFor={emailId} className="text-sm font-medium text-fg">
          Email address
        </label>
        <input
          id={emailId}
          name={emailId}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="focus-ring w-full max-w-sm rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg"
        />
        <p className="text-xs text-fg-muted">
          We send a confirmation link there. Nothing changes until you use it.
        </p>
      </div>
      <button
        type="submit"
        disabled={busy || email.trim() === ""}
        className="focus-ring self-start rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent/90 disabled:opacity-60"
      >
        {busy ? "Sending…" : "Send confirmation"}
      </button>
    </form>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  const hintId = `${id}-hint`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type="password"
        autoComplete="new-password"
        value={value}
        aria-describedby={hint ? hintId : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="focus-ring w-full max-w-sm rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg"
      />
      {hint ? (
        <p id={hintId} className="text-xs text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Honest copy for a failed step-up START. */
function startErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.status) {
      case 422:
        return "That doesn't look like a valid handle.";
      case 502:
        return "Could not reach your sign-in provider. Try again shortly.";
      case 503:
        return "This instance has turned that sign-in off, so it cannot confirm you this way. Ask whoever runs it for help.";
    }
  }
  return "Could not start the confirmation. Please try again.";
}

/**
 * Honest copy for the write the assertion unlocked. A 403 here means the
 * assertion is gone — expired, already spent, or from another session — and the
 * only cure is another round trip, so the message says so instead of leaving
 * the user resubmitting a dead form.
 */
function writeErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) {
      return "That confirmation has expired or was already used. Start it again.";
    }
    if (err.status === 409) {
      return "That email address is already in use on this instance.";
    }
    if (err.status === 422) return errorMessage(err);
  }
  return errorMessage(err);
}

/** The callback's machine codes, as sentences. */
function stepUpErrorMessage(code: string): string {
  switch (code) {
    case "step_up_identity_mismatch":
      return "That sign-in is not the one linked to this account, so it does not confirm you. Sign in with the account you use here.";
    case "atproto_disabled":
      return "This instance has turned that sign-in off, so it cannot confirm you this way.";
    case "atproto_upstream":
      return "Could not reach your sign-in provider. Try again shortly.";
    default:
      return "The confirmation did not complete. Please try again.";
  }
}
