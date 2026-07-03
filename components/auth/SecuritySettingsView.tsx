"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { QrCode } from "@/components/QrCode";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, authApi } from "@/lib/api";
import type { MFAStatusResponse, TOTPEnrollmentResponse } from "@/lib/api";

// SecuritySettingsView is the /settings/security surface: the TOTP two-factor
// status card (enabled + recovery codes remaining), the enrollment flow
// (secret + QR -> first code -> the 10 recovery codes shown ONCE with copy/
// download affordances and an explicit "I saved them" confirmation), and the
// password-confirmed disable flow. The secret and recovery codes exist only in
// component state — never in logs, URLs, or storage.
export function SecuritySettingsView() {
  const { status } = useSession();

  if (status === "restoring") {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading your account" />
      </div>
    );
  }

  if (status === "anon") {
    return (
      <EmptyState
        title="Sign in to manage security settings"
        message={
          <>
            Your session has ended.{" "}
            <Link href="/login" className="underline hover:text-zinc-700 dark:hover:text-zinc-200">
              Sign in
            </Link>{" "}
            to manage two-factor authentication.
          </>
        }
      />
    );
  }

  return <TwoFactorSection />;
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
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
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
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
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
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
        >
          {error}
        </p>
      ) : null}

      {loadError ? (
        <div className="flex items-center gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-sm text-zinc-600 dark:text-zinc-400" role="alert">
            Could not load your two-factor status.
          </p>
          <button
            type="button"
            onClick={reload}
            className="rounded-md border border-zinc-300 px-2.5 py-1 text-sm text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
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
              className="self-start rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
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
    <section className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Two-factor authentication
        </h2>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            mfa.enabled
              ? "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300"
              : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
          }`}
        >
          {mfa.enabled ? "On" : "Off"}
        </span>
      </div>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {mfa.enabled ? (
          <>
            Signing in requires a code from your authenticator app.{" "}
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
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
    <section className="flex flex-col gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Set up your authenticator app
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Scan the QR code with an authenticator app (or enter the secret manually), then confirm
          with the app&apos;s current 6-digit code. The secret is shown only once.
        </p>
      </div>

      <div className="flex flex-col items-start gap-4 sm:flex-row">
        <QrCode value={enrollment.otpauth_uri} label="Authenticator enrollment QR code" />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-sm font-medium">Secret for manual entry</span>
          <code
            data-testid="totp-secret"
            className="break-all rounded-md bg-zinc-100 px-2 py-1 font-mono text-sm dark:bg-zinc-800"
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
          <label htmlFor="totp-verify-code" className="text-sm font-medium">
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
            className="w-40 rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy || code.trim() === ""}
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {busy ? "Verifying…" : "Verify code"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="text-sm text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
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
    <section className="flex flex-col gap-4 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-amber-800 dark:text-amber-300">
          Save your recovery codes
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Two-factor authentication is now on. Each code below signs you in once if you lose your
          authenticator.{" "}
          <span className="font-medium">They are shown only this once — store them safely.</span>
        </p>
      </div>

      <ol
        aria-label="Recovery codes"
        className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-md bg-white p-3 font-mono text-sm dark:bg-zinc-900"
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
          className="rounded-md border border-zinc-300 px-2.5 py-1 text-sm text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Download codes
        </button>
      </div>

      <button
        type="button"
        onClick={onConfirm}
        className="self-start rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
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
    <section className="flex flex-col gap-3 rounded-md border border-red-200 p-4 dark:border-red-900/50">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold text-red-700 dark:text-red-300">
          Turn off two-factor authentication
        </h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
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
          <label htmlFor="mfa-disable-password" className="text-sm font-medium">
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
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <button
          type="submit"
          disabled={busy || password === ""}
          className="self-start rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-60"
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
        className="self-start rounded-md border border-zinc-300 px-2.5 py-1 text-sm text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        {label}
      </button>
      {state === "copied" ? (
        <span role="status" className="text-xs text-green-700 dark:text-green-300">
          Copied.
        </span>
      ) : state === "failed" ? (
        <span role="status" className="text-xs text-zinc-500 dark:text-zinc-400">
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
