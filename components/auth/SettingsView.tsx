"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AccountDataSection } from "@/components/auth/AccountDataSection";
import { useSession } from "@/components/auth/AuthProvider";
import { ConnectedLogins } from "@/components/auth/ConnectedLogins";
import { ProfileImageManager } from "@/components/ProfileImageManager";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api, authApi, errorMessage, userAvatarUrl, userBannerUrl } from "@/lib/api";
import type { UpdateProfileRequest, User } from "@/lib/api";

// SettingsView lets the signed-in user edit their profile (display name, bio)
// and deactivate their account. On a hard reload the session is restored via
// the httpOnly refresh cookie — show a loading state until that settles; only
// a settled signed-out state gets the sign-in prompt.
export function SettingsView() {
  const { status, user, updateProfile, deactivate, deleteAccount, reloadUser, logout } =
    useSession();
  // Flipped after a successful permanent delete: the session is gone, so this
  // must be checked BEFORE the signed-out prompt or the goodbye state would
  // never show.
  const [deleted, setDeleted] = useState(false);

  if (deleted) {
    return (
      <EmptyState
        title="Your account has been deleted"
        message={
          <>
            Your channels and videos were permanently removed, and your comments were replaced
            with anonymous tombstones. This cannot be undone.{" "}
            <Link href="/" className="underline hover:text-zinc-700 dark:hover:text-zinc-200">
              Go home
            </Link>
          </>
        }
      />
    );
  }

  if (status === "restoring") {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading your account" />
      </div>
    );
  }

  if (status === "anon" || !user) {
    return (
      <EmptyState
        title="Sign in to manage your account"
        message={
          <>
            Your session has ended.{" "}
            <Link href="/login" className="underline hover:text-zinc-700 dark:hover:text-zinc-200">
              Sign in
            </Link>{" "}
            to edit your profile.
          </>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1 border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight">Account settings</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Signed in as @{user.username}
        </p>
      </header>
      {user.email_verified ? null : <EmailVerificationSection email={user.email} />}
      <ProfileForm
        key={user.id}
        initialDisplayName={user.display_name}
        initialBio={user.bio}
        initialUnlisted={user.unlisted ?? false}
        updateProfile={updateProfile}
      />
      <ProfileImagesSection
        key={`images-${user.id}`}
        user={user}
        onChanged={() => void reloadUser().catch(() => {})}
      />
      <section className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Security</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Two-factor authentication and recovery codes.
          </p>
        </div>
        <Link
          href="/settings/security"
          aria-label="Manage security settings"
          className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Manage
        </Link>
      </section>
      <ConnectedLogins />
      <section className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Connected accounts
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Connect Bluesky to cross-post your new public videos (ATProto).
          </p>
        </div>
        <Link
          href="/settings/connections"
          aria-label="Manage connected accounts"
          className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Manage
        </Link>
      </section>
      <section className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Encrypted-messaging devices
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Devices that can read your encrypted messages, and their safety numbers.
          </p>
        </div>
        <Link
          href="/settings/devices"
          aria-label="Manage encrypted-messaging devices"
          className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Manage
        </Link>
      </section>
      <section className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Notifications</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Choose which notifications you receive.
          </p>
        </div>
        <Link
          href="/settings/notifications"
          aria-label="Manage notification preferences"
          className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Manage
        </Link>
      </section>
      <section className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Donation addresses
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Public crypto addresses shown on your profile and channels (display only).
          </p>
        </div>
        <Link
          href="/settings/donations"
          aria-label="Manage donation addresses"
          className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Manage
        </Link>
      </section>
      <section className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Mutes</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Accounts and federated instances whose content is hidden from you.
          </p>
        </div>
        <Link
          href="/settings/mutes"
          aria-label="Manage muted accounts"
          className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Manage
        </Link>
      </section>
      <section className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Blocked accounts</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Accounts you have blocked. Neither of you can direct-message the other.
          </p>
        </div>
        <Link
          href="/settings/blocks"
          aria-label="Manage blocked accounts"
          className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Manage
        </Link>
      </section>
      <AccountDataSection />
      {/* Header sign-out is hidden on phones (the avatar is the only account
          control there), so settings must offer it. Named distinctly from the
          header's "Sign out" so the two never collide in the a11y tree. */}
      <section className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Session</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Sign out of Vidra on this device.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void logout();
          }}
          className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Sign out of this device
        </button>
      </section>
      <DeactivateSection deactivate={deactivate} />
      <DeleteAccountSection
        username={user.username}
        deleteAccount={deleteAccount}
        onDeleted={() => setDeleted(true)}
      />
    </div>
  );
}

// ProfileImagesSection hosts the account avatar + profile banner managers. The
// avatar shows everywhere the account's identity does (header, comments); the
// banner is stored for the public profile surface. onChanged re-reads /auth/me
// so has_avatar/has_banner (and the header avatar) stay in sync.
function ProfileImagesSection({
  user,
  onChanged,
}: {
  user: User;
  onChanged: () => void;
}) {
  const name = user.display_name || user.username;
  return (
    <div className="flex max-w-xl flex-col gap-3">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Profile images</h2>
      <ProfileImageManager
        kind="avatar"
        label="Avatar"
        name={name}
        has={user.has_avatar ?? false}
        src={userAvatarUrl(user.id)}
        upload={(file) => api.setMyAvatar(file)}
        remove={() => api.deleteMyAvatar()}
        onChanged={onChanged}
      />
      <ProfileImageManager
        kind="banner"
        label="Banner"
        name={name}
        has={user.has_banner ?? false}
        src={userBannerUrl(user.id)}
        upload={(file) => api.setMyBanner(file)}
        remove={() => api.deleteMyBanner()}
        onChanged={onChanged}
      />
    </div>
  );
}

function EmailVerificationSection({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    setError(null);
    setState("sending");
    try {
      await authApi.requestEmailVerification();
      setState("sent");
    } catch (err) {
      setState("idle");
      setError(errorMessage(err));
    }
  }

  return (
    <section className="flex max-w-xl flex-col gap-3 rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-amber-800 dark:text-amber-300">
          Verify your email
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Your email <span className="font-medium">{email}</span> is not verified yet. Check your
          inbox for the verification link, or resend it below.
        </p>
      </div>
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
        >
          {error}
        </p>
      ) : null}
      {state === "sent" ? (
        <p
          role="status"
          className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-300"
        >
          Verification email sent. Check your inbox.
        </p>
      ) : (
        <button
          type="button"
          onClick={() => void resend()}
          disabled={state === "sending"}
          className="self-start rounded-md border border-amber-400 bg-white px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-60 dark:bg-transparent dark:text-amber-200 dark:hover:bg-amber-900/30"
        >
          {state === "sending" ? "Sending…" : "Resend verification email"}
        </button>
      )}
    </section>
  );
}

function DeactivateSection({ deactivate }: { deactivate: (password: string) => Promise<void> }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      await deactivate(password);
      // The account is disabled and the session is cleared; leave the page.
      router.push("/");
    } catch (err) {
      setSubmitting(false);
      setError(
        errorMessage(err, "Something went wrong. Please try again.", {
          "403": "Incorrect password.",
        }),
      );
    }
  }

  return (
    <section className="flex max-w-xl flex-col gap-3 rounded-md border border-red-200 p-4 dark:border-red-900/50">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-red-700 dark:text-red-300">Deactivate account</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          This disables your account and signs you out everywhere. You will not be able to sign in
          again. Confirm your password to continue.
        </p>
      </div>
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
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
          >
            {error}
          </p>
        ) : null}
        <div className="flex flex-col gap-1">
          <label htmlFor="deactivate-password" className="text-sm font-medium">
            Current password
          </label>
          <input
            id="deactivate-password"
            name="deactivate-password"
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
          disabled={submitting || password === ""}
          className="self-start rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-60"
        >
          {submitting ? "Deactivating…" : "Deactivate account"}
        </button>
      </form>
    </section>
  );
}

// DeleteAccountSection is the IRREVERSIBLE variant of the danger zone: a
// two-step confirmation (explicit arm step, then password + type-the-username)
// before DELETE /auth/me. Distinct from Deactivate, which is reversible by an
// admin. On success the parent shows the goodbye state (the session is gone).
function DeleteAccountSection({
  username,
  deleteAccount,
  onDeleted,
}: {
  username: string;
  deleteAccount: (password: string) => Promise<void>;
  onDeleted: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      await deleteAccount(password);
      onDeleted();
    } catch (err) {
      setSubmitting(false);
      setError(
        errorMessage(err, "Something went wrong. Please try again.", {
          "403": "Incorrect password.",
        }),
      );
    }
  }

  return (
    <section className="flex max-w-xl flex-col gap-3 rounded-md border border-red-300 p-4 dark:border-red-900/70">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-red-700 dark:text-red-300">
          Delete account permanently
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          This permanently deletes your account. Your channels and videos are removed for good,
          your comments are replaced with anonymous &ldquo;[deleted]&rdquo; tombstones (replies to
          them are kept), and your playlists, follows, history, and settings are erased. This
          cannot be undone — if you might come back, use Deactivate above instead.
        </p>
      </div>
      {!armed ? (
        <button
          type="button"
          onClick={() => setArmed(true)}
          className="self-start rounded-md border border-red-600 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:text-red-300 dark:hover:bg-red-950/30"
        >
          Delete account permanently
        </button>
      ) : (
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
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
            >
              {error}
            </p>
          ) : null}
          <div className="flex flex-col gap-1">
            <label htmlFor="delete-password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="delete-password"
              name="delete-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="delete-confirm-username" className="text-sm font-medium">
              Confirm your username
            </label>
            <input
              id="delete-confirm-username"
              name="delete-confirm-username"
              type="text"
              autoComplete="off"
              required
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              aria-describedby="delete-confirm-username-help"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
            />
            <span
              id="delete-confirm-username-help"
              className="text-xs text-zinc-500 dark:text-zinc-400"
            >
              Type <span className="font-mono font-medium">{username}</span> exactly to enable
              deletion.
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={submitting || password === "" || confirmName !== username}
              className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-60"
            >
              {submitting ? "Deleting…" : "Permanently delete my account"}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                setArmed(false);
                setPassword("");
                setConfirmName("");
                setError(null);
              }}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function ProfileForm({
  initialDisplayName,
  initialBio,
  initialUnlisted,
  updateProfile,
}: {
  initialDisplayName: string;
  initialBio: string;
  initialUnlisted: boolean;
  updateProfile: (input: UpdateProfileRequest) => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [bio, setBio] = useState(initialBio);
  const [unlisted, setUnlisted] = useState(initialUnlisted);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");

  async function submit() {
    setFieldErrors({});
    setFormError(null);
    setState("saving");
    try {
      await updateProfile({ display_name: displayName, bio, unlisted });
      setState("saved");
    } catch (err) {
      setState("idle");
      if (err instanceof ApiError && err.fields && err.fields.length > 0) {
        const map: Record<string, string> = {};
        for (const f of err.fields) map[f.field] = f.message;
        setFieldErrors(map);
      } else {
        setFormError(errorMessage(err));
      }
    }
  }

  function edited(setter: (v: string) => void) {
    return (v: string) => {
      setter(v);
      setState("idle");
    };
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex max-w-xl flex-col gap-4"
    >
      {formError ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
        >
          {formError}
        </p>
      ) : null}
      {state === "saved" ? (
        <p
          role="status"
          className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-300"
        >
          Profile saved.
        </p>
      ) : null}

      <div className="flex flex-col gap-1">
        <label htmlFor="settings-display-name" className="text-sm font-medium">
          Display name
        </label>
        <input
          id="settings-display-name"
          name="settings-display-name"
          type="text"
          maxLength={50}
          value={displayName}
          onChange={(e) => edited(setDisplayName)(e.target.value)}
          aria-invalid={fieldErrors.display_name ? true : undefined}
          aria-describedby={fieldErrors.display_name ? "settings-display-name-error" : undefined}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
        />
        {fieldErrors.display_name ? (
          <p id="settings-display-name-error" className="text-xs text-red-600 dark:text-red-400">
            {fieldErrors.display_name}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="settings-bio" className="text-sm font-medium">
          Bio
        </label>
        <textarea
          id="settings-bio"
          name="settings-bio"
          rows={4}
          maxLength={1000}
          value={bio}
          onChange={(e) => edited(setBio)(e.target.value)}
          aria-invalid={fieldErrors.bio ? true : undefined}
          aria-describedby={fieldErrors.bio ? "settings-bio-error" : undefined}
          className="resize-y rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
        />
        {fieldErrors.bio ? (
          <p id="settings-bio-error" className="text-xs text-red-600 dark:text-red-400">
            {fieldErrors.bio}
          </p>
        ) : null}
      </div>

      <div className="flex items-start gap-2">
        <input
          id="settings-unlisted"
          name="settings-unlisted"
          type="checkbox"
          checked={unlisted}
          onChange={(e) => {
            setUnlisted(e.target.checked);
            setState("idle");
          }}
          aria-describedby="settings-unlisted-help"
          className="mt-0.5 h-4 w-4 rounded border-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700"
        />
        <div className="flex flex-col">
          <label htmlFor="settings-unlisted" className="text-sm font-medium">
            Hide my account from discovery
          </label>
          <span id="settings-unlisted-help" className="text-xs text-zinc-500 dark:text-zinc-400">
            Your channels and videos stay reachable by direct link but no longer appear in the
            public feed or search on this instance.
          </span>
        </div>
      </div>

      <button
        type="submit"
        disabled={state === "saving"}
        className="self-start rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {state === "saving" ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
