"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api } from "@/lib/api";

type RegState = "loading" | "open" | "closed";

export function SignupForm() {
  const router = useRouter();
  const { register } = useSession();

  const [regState, setRegState] = useState<RegState>("loading");
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [note, setNote] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Set when register answered 202: the signup awaits admin approval.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getInstance(controller.signal)
      .then((instance) => {
        setRequiresApproval(instance.registration_requires_approval === true);
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

  if (regState === "loading") {
    return (
      <div className="flex justify-center py-12">
        <Spinner label="Loading" />
      </div>
    );
  }
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
      {formError ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
        >
          {formError}
        </p>
      ) : null}

      <Field
        id="signup-username"
        label="Username"
        type="text"
        autoComplete="username"
        value={username}
        onChange={setUsername}
        error={fieldErrors.username}
      />
      <Field
        id="signup-email"
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={setEmail}
        error={fieldErrors.email}
      />
      <Field
        id="signup-password"
        label="Password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
        error={fieldErrors.password}
      />

      {requiresApproval ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="signup-note" className="text-sm font-medium">
            Message to the administrators (optional)
          </label>
          <textarea
            id="signup-note"
            name="signup-note"
            rows={3}
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {submitting ? "Creating account…" : "Create account"}
      </button>

      {requiresApproval ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          New accounts on this instance require administrator approval. Your signup will be
          reviewed before you can sign in.
        </p>
      ) : null}

      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Already have an account?{" "}
        <Link href="/login" className="underline hover:text-zinc-700 dark:hover:text-zinc-200">
          Sign in
        </Link>
      </p>
    </form>
  );
}

function Field({
  id,
  label,
  type,
  autoComplete,
  value,
  onChange,
  error,
}: {
  id: string;
  label: string;
  type: string;
  autoComplete: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
      />
      {error ? (
        <p id={errorId} className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
