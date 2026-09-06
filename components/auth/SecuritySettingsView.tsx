"use client";

import { useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { ChangeEmailSection } from "@/components/auth/ChangeEmailSection";
import { ChangePasswordSection } from "@/components/auth/ChangePasswordSection";
import { QrCode } from "@/components/QrCode";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, authApi, errorMessage } from "@/lib/api";
import type { MFAStatusResponse, TOTPEnrollmentResponse } from "@/lib/api";
import { SignInGate } from "@/components/SignInGate";

// SecuritySettingsView is the /settings/security surface: the TOTP two-factor
// status card (enabled + recovery codes remaining), the enrollment flow
// (secret + QR -> first code -> the 10 recovery codes shown ONCE with copy/
// download affordances and an explicit "I saved them" confirmation), and the
// password-confirmed disable flow. The secret and recovery codes exist only in
// component state — never in logs, URLs, or storage.
export function SecuritySettingsView() {
  const { status, logoutEverywhere } = useSession();

  // `!== "authed"` rather than `=== "anon"`: this view used to rely on a
  // preceding `restoring` branch to catch the boot-time refresh, so testing
  // only for "anon" here would mount (and 401) the two-factor fetch mid-restore.
  if (status !== "authed") {
    return (
      <SignInGate
        title="Sign in to manage security settings"
        lead="Your session has ended."
        restoringLabel="Loading your account"
      >
        to manage two-factor authentication.
      </SignInGate>
    );
  }

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <TwoFactorSection />
      {/* Email then password: the address is how the account is recovered, so
          it is the more consequential of the two, and both are gated on the
          same current-password proof. */}
      <ChangeEmailSection />
      {/* Password sits next to the devices control because they are the same
          decision: changing the password signs the other devices out. */}
      <ChangePasswordSection />
      <SignOutEverywhereSection logoutEverywhere={logoutEverywhere} />
    </div>
  );
}

// SignOutEverywhereSection is the reachable front for POST /auth/logout-all.
// Without it a user who thinks a device is compromised had two doors: a full
// password reset, or DEACTIVATING the account — whose own copy advertises "signs
// you out everywhere", which is how we knew people wanted this and were being
// routed through the wrong control. Armed-then-confirmed like the danger-zone
// destructions, because it cannot be undone from the other devices' side.
// Deliberately NOT a session list — that needs a core endpoint we do not have.
function SignOutEverywhereSection({
  logoutEverywhere,
}: {
  logoutEverywhere: () => Promise<void>;
}) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      // On success every session is revoked INCLUDING this one, so the provider
      // clears the local store and this view falls back to the sign-in gate.
      await logoutEverywhere();
    } catch (err) {
      setBusy(false);
      setError(errorMessage(err));
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold tracking-tight text-fg">Signed-in devices</h2>
        <p className="text-sm text-fg-muted">
          Signing out of all devices ends every session on every browser and device, including
          this one. Use it if you think someone else has access to your account &mdash; then sign
          back in and change your password.
        </p>
      </div>
      {error ? <Alert>{error}</Alert> : null}
      {armed ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="focus-ring rounded-full bg-danger-solid px-4 py-2 text-sm font-semibold text-danger-fg transition-colors hover:bg-danger-solid/90 disabled:opacity-60"
          >
            {busy ? "Signing out…" : "Yes, sign me out everywhere"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setArmed(false);
              setError(null);
            }}
            className="focus-ring rounded-sm text-sm font-semibold text-fg hover:underline disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setArmed(true)}
          className="focus-ring self-start rounded-full border border-danger/45 px-4 py-2 text-sm font-semibold text-danger transition-colors hover:bg-danger/10"
        >
          Sign out of all devices
        </button>
      )}
    </section>
  );
}

type Phase = "status" | "enrolling" | "recovery";

function TwoFactorSection() {
  const [mfa, setMfa] = useState<MFAStatusResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [phase, setPhase] = useState<Phase>("status");
  const [enrollment, setEnrollment] = useState<TOTPEnrollmentResponse | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    authApi
      .getMFAStatus(controller.signal)
      .then(setMfa)
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true);
      });
    return () => controller.abort();
  }, [reloadKey]);

  // reload re-reads the two-factor status (loading state shown meanwhile).
  // Only ever called from event handlers, never from an effect.
  function reload() {
    setMfa(null);
    setLoadError(false);
    setReloadKey((k) => k + 1);
  }

  async function start() {
    setError(null);
    setBusy(true);
    try {
      setEnrollment(await authApi.beginTOTPEnrollment());
      setPhase("enrolling");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Already enabled (e.g. finished in another tab) — reflect reality.
        reload();
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  async function verify(code: string) {
    setError(null);
    setBusy(true);
    try {
      const res = await authApi.verifyTOTPEnrollment(code);
      setRecoveryCodes(res.recovery_codes);
      setEnrollment(null); // the secret is in the authenticator now; drop it
      setPhase("recovery");
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setError("That code didn't verify — check your authenticator app and try again.");
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  function confirmSaved() {
    setRecoveryCodes(null);
    setPhase("status");
    reload();
  }

  async function disable(password: string) {
    setError(null);
    setBusy(true);
    try {
      await authApi.disableTOTP(password);
      reload();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError("Incorrect password.");
      } else if (err instanceof ApiError && err.status === 404) {
        // Not enabled after all — reflect reality.
        reload();
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      {error ? (
        <Alert>
          {error}
        </Alert>
      ) : null}

      {loadError ? (
        <div className="flex items-center gap-3 rounded-2xl border border-border-subtle p-4">
          <p className="text-sm text-fg-muted" role="alert">
            Could not load your two-factor status.
          </p>
          <button
            type="button"
            onClick={reload}
            className="focus-ring rounded-full border border-border bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-muted"
          >
            Retry
          </button>
        </div>
      ) : mfa === null ? (
        <div className="flex justify-center py-8">
          <Spinner label="Loading two-factor status" />
        </div>
      ) : phase === "recovery" && recoveryCodes ? (
        <RecoveryCodesStep codes={recoveryCodes} onConfirm={confirmSaved} />
      ) : phase === "enrolling" && enrollment ? (
        <EnrollStep
          enrollment={enrollment}
          busy={busy}
          onVerify={verify}
          onCancel={() => {
            // The pending server-side enrollment stays inert (login is
            // unaffected until verified); restarting issues a fresh secret.
            setEnrollment(null);
            setError(null);
            setPhase("status");
          }}
        />
      ) : (
        <>
          <StatusCard mfa={mfa} />
          {mfa.enabled ? (
            <DisableForm busy={busy} onDisable={disable} />
          ) : (
            <button
              type="button"
              onClick={() => void start()}
              disabled={busy}
              className="focus-ring self-start rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent/90 disabled:opacity-60"
            >
              {busy ? "Starting…" : "Turn on two-factor authentication"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function StatusCard({ mfa }: { mfa: MFAStatusResponse }) {
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-border-subtle bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight text-fg">
          Two-factor authentication
        </h2>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
            mfa.enabled
              ? "bg-success/15 text-success"
              : "bg-surface-strong text-fg-muted"
          }`}
        >
          {mfa.enabled ? "On" : "Off"}
        </span>
      </div>
      <p className="text-sm text-fg-muted">
        {mfa.enabled ? (
          <>
            Signing in requires a code from your authenticator app.{" "}
            <span className="font-medium text-fg">
              {mfa.recovery_codes_remaining} recovery{" "}
              {mfa.recovery_codes_remaining === 1 ? "code" : "codes"} left.
            </span>
            {mfa.recovery_codes_remaining === 0
              ? " You have no recovery codes left — turn two-factor off and on again to get a fresh set."
              : null}
          </>
        ) : (
          "Protect your account with a one-time code from an authenticator app at every sign-in."
        )}
      </p>
    </section>
  );
}

function EnrollStep({
  enrollment,
  busy,
  onVerify,
  onCancel,
}: {
  enrollment: TOTPEnrollmentResponse;
  busy: boolean;
  onVerify: (code: string) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState("");
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border-subtle bg-surface p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold tracking-tight text-fg">
          Set up your authenticator app
        </h2>
        <p className="text-sm text-fg-muted">
          Scan the QR code with an authenticator app (or enter the secret manually), then confirm
          with the app&apos;s current 6-digit code. The secret is shown only once.
        </p>
      </div>

      <div className="flex flex-col items-start gap-4 sm:flex-row">
        <QrCode value={enrollment.otpauth_uri} label="Authenticator enrollment QR code" />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-sm font-medium text-fg">Secret for manual entry</span>
          <code
            data-testid="totp-secret"
            className="break-all rounded-lg bg-surface-muted px-2 py-1 font-mono text-sm text-fg"
          >
            {enrollment.secret}
          </code>
          <CopyButton text={enrollment.secret} label="Copy secret" />
        </div>
      </div>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          onVerify(code.trim());
        }}
        className="flex flex-col gap-3"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="totp-verify-code" className="text-sm font-medium text-fg">
            Verification code
          </label>
          <input
            id="totp-verify-code"
            name="totp-verify-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="focus-ring w-40 rounded-xl border border-border bg-surface px-3.5 py-2 text-sm tabular-nums text-fg"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy || code.trim() === ""}
            className="focus-ring rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent/90 disabled:opacity-60"
          >
            {busy ? "Verifying…" : "Verify code"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="focus-ring rounded-sm text-sm font-semibold text-fg hover:underline"
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}

function RecoveryCodesStep({ codes, onConfirm }: { codes: string[]; onConfirm: () => void }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-warning/30 bg-warning/10 p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold tracking-tight text-warning">
          Save your recovery codes
        </h2>
        <p className="text-sm text-fg-muted">
          Two-factor authentication is now on. Each code below signs you in once if you lose your
          authenticator.{" "}
          <span className="font-medium text-fg">They are shown only this once — store them safely.</span>
        </p>
      </div>

      <ol
        aria-label="Recovery codes"
        className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-xl bg-surface p-3 font-mono text-sm text-fg"
      >
        {codes.map((code) => (
          <li key={code}>
            <code>{code}</code>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-3">
        <CopyButton text={codes.join("\n")} label="Copy recovery codes" />
        <button
          type="button"
          onClick={() => downloadTextFile("vidra-recovery-codes.txt", codes.join("\n") + "\n")}
          className="focus-ring rounded-full border border-border bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-muted"
        >
          Download codes
        </button>
      </div>

      <button
        type="button"
        onClick={onConfirm}
        className="focus-ring self-start rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent/90"
      >
        I saved my recovery codes
      </button>
    </section>
  );
}

function DisableForm({
  busy,
  onDisable,
}: {
  busy: boolean;
  onDisable: (password: string) => void;
}) {
  const [password, setPassword] = useState("");
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-danger-border p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold tracking-tight text-danger">
          Turn off two-factor authentication
        </h3>
        <p className="text-sm text-fg-muted">
          Sign-in goes back to password only, and every recovery code is deleted. Confirm your
          password to continue.
        </p>
      </div>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          onDisable(password);
        }}
        className="flex flex-col gap-3"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="mfa-disable-password" className="text-sm font-medium text-fg">
            Current password
          </label>
          <input
            id="mfa-disable-password"
            name="mfa-disable-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="focus-ring w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg"
          />
        </div>
        <button
          type="submit"
          disabled={busy || password === ""}
          className="focus-ring self-start rounded-full bg-danger-solid px-4 py-2 text-sm font-semibold text-danger-fg transition-colors hover:bg-danger-solid/90 disabled:opacity-60"
        >
          {busy ? "Turning off…" : "Turn off two-factor authentication"}
        </button>
      </form>
    </section>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed"); // clipboard unavailable — the text stays selectable
    }
  }
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => void copy()}
        className="focus-ring self-start rounded-full border border-border bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-muted"
      >
        {label}
      </button>
      {state === "copied" ? (
        <span role="status" className="text-xs font-medium text-success">
          Copied.
        </span>
      ) : state === "failed" ? (
        <span role="status" className="text-xs text-fg-muted">
          Copy failed — select the text manually.
        </span>
      ) : null}
    </span>
  );
}

// downloadTextFile hands sensitive text (recovery codes) to the browser's
// download pipeline via a short-lived object URL — nothing touches the server
// or persistent storage on our side.
function downloadTextFile(filename: string, contents: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
