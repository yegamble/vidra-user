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
            <Link href="/" className="focus-ring rounded-sm font-semibold text-fg underline underline-offset-2">
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
            <Link href="/login" className="focus-ring rounded-sm font-semibold text-fg underline underline-offset-2">
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
      <header className="flex flex-col gap-1 border-b border-border-subtle pb-4">
        <h1 className="text-2xl font-bold tracking-tight">Account settings</h1>
        <p className="text-[13px] text-fg-muted">
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
      <section className="flex items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-surface p-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-fg">Security</h2>
          <p className="text-sm text-fg-muted">
            Two-factor authentication and recovery codes.
          </p>
        </div>
        <Link
          href="/settings/security"
          aria-label="Manage security settings"
          className="focus-ring shrink-0 rounded-full border border-border bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-muted"
        >
          Manage
        </Link>
      </section>
      <ConnectedLogins />
      <section className="flex items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-surface p-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-fg">
            Connected accounts
          </h2>
          <p className="text-sm text-fg-muted">
            Connect Bluesky to cross-post your new public videos (ATProto).
          </p>
        </div>
        <Link
          href="/settings/connections"
          aria-label="Manage connected accounts"
          className="focus-ring shrink-0 rounded-full border border-border bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-muted"
        >
          Manage
        </Link>
      </section>
      <section className="flex items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-surface p-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-fg">
            Encrypted-messaging devices
          </h2>
          <p className="text-sm text-fg-muted">
            Devices that can read your encrypted messages, and their safety numbers.
          </p>
        </div>
        <Link
          href="/settings/devices"
          aria-label="Manage encrypted-messaging devices"
          className="focus-ring shrink-0 rounded-full border border-border bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-muted"
        >
          Manage
        </Link>
      </section>
      <section className="flex items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-surface p-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-fg">Notifications</h2>
          <p className="text-sm text-fg-muted">
            Choose which notifications you receive.
          </p>
        </div>
        <Link
          href="/settings/notifications"
          aria-label="Manage notification preferences"
          className="focus-ring shrink-0 rounded-full border border-border bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-muted"
        >
          Manage
        </Link>
      </section>
      <section className="flex items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-surface p-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-fg">
            Donation addresses
          </h2>
          <p className="text-sm text-fg-muted">
            Public crypto addresses shown on your profile and channels (display only).
          </p>
        </div>
        <Link
          href="/settings/donations"
          aria-label="Manage donation addresses"
          className="focus-ring shrink-0 rounded-full border border-border bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-muted"
        >
          Manage
        </Link>
      </section>
      <section className="flex items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-surface p-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-fg">Mutes</h2>
          <p className="text-sm text-fg-muted">
            Accounts and federated instances whose content is hidden from you.
          </p>
        </div>
        <Link
          href="/settings/mutes"
          aria-label="Manage muted accounts"
          className="focus-ring shrink-0 rounded-full border border-border bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-muted"
        >
          Manage
        </Link>
      </section>
      <section className="flex items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-surface p-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-fg">Blocked accounts</h2>
          <p className="text-sm text-fg-muted">
            Accounts you have blocked. Neither of you can direct-message the other.
          </p>
        </div>
        <Link
          href="/settings/blocks"
          aria-label="Manage blocked accounts"
          className="focus-ring shrink-0 rounded-full border border-border bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-muted"
        >
          Manage
        </Link>
      </section>
      <AccountDataSection />
      {/* Header sign-out is hidden on phones (the avatar is the only account
          control there), so settings must offer it. Named distinctly from the
          header's "Sign out" so the two never collide in the a11y tree. */}
      <section className="flex items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-surface p-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-fg">Session</h2>
          <p className="text-sm text-fg-muted">
            Sign out of Vidra on this device.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void logout();
          }}
          className="focus-ring shrink-0 rounded-full border border-border bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-muted"
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
      <h2 className="text-base font-semibold tracking-tight text-fg">Profile images</h2>
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
    <section className="flex max-w-xl flex-col gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold tracking-tight text-warning">
          Verify your email
        </h2>
        <p className="text-sm text-fg-muted">
          Your email <span className="font-medium text-fg">{email}</span> is not verified yet. Check your
          inbox for the verification link, or resend it below.
        </p>
      </div>
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-danger-border bg-danger-surface px-3.5 py-2.5 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}
      {state === "sent" ? (
        <p
          role="status"
          className="rounded-xl bg-success/15 px-3.5 py-2.5 text-sm text-success"
        >
          Verification email sent. Check your inbox.
        </p>
      ) : (
        <button
          type="button"
          onClick={() => void resend()}
          disabled={state === "sending"}
          className="focus-ring self-start rounded-full border border-warning/40 bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-warning transition-colors hover:bg-warning/10 disabled:opacity-60"
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
    <section className="flex max-w-xl flex-col gap-3 rounded-2xl border border-danger-border p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold tracking-tight text-danger">Deactivate account</h2>
        <p className="text-sm text-fg-muted">
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
            className="rounded-xl border border-danger-border bg-danger-surface px-3.5 py-2.5 text-sm text-danger"
          >
            {error}
          </p>
        ) : null}
        <div className="flex flex-col gap-1">
          <label htmlFor="deactivate-password" className="text-sm font-medium text-fg">
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
            className="focus-ring w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg"
          />
        </div>
        <button
          type="submit"
          disabled={submitting || password === ""}
          className="focus-ring self-start rounded-full bg-danger-solid px-4 py-2 text-sm font-semibold text-danger-fg transition-colors hover:bg-danger-solid/90 disabled:opacity-60"
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
    <section className="flex max-w-xl flex-col gap-3 rounded-2xl border border-danger-border p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold tracking-tight text-danger">
          Delete account permanently
        </h2>
        <p className="text-sm text-fg-muted">
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
          className="focus-ring self-start rounded-full border border-danger-border px-4 py-2 text-sm font-semibold text-danger transition-colors hover:bg-danger-surface"
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
              className="rounded-xl border border-danger-border bg-danger-surface px-3.5 py-2.5 text-sm text-danger"
            >
              {error}
            </p>
          ) : null}
          <div className="flex flex-col gap-1">
            <label htmlFor="delete-password" className="text-sm font-medium text-fg">
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
              className="focus-ring w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="delete-confirm-username" className="text-sm font-medium text-fg">
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
              className="focus-ring w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg"
            />
            <span
              id="delete-confirm-username-help"
              className="text-xs text-fg-muted"
            >
              Type <span className="font-mono font-medium text-fg">{username}</span> exactly to enable
              deletion.
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={submitting || password === "" || confirmName !== username}
              className="focus-ring rounded-full bg-danger-solid px-4 py-2 text-sm font-semibold text-danger-fg transition-colors hover:bg-danger-solid/90 disabled:opacity-60"
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
              className="focus-ring rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-fg transition-colors hover:bg-surface-muted disabled:opacity-60"
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
          className="rounded-xl border border-danger-border bg-danger-surface px-3.5 py-2.5 text-sm text-danger"
        >
          {formError}
        </p>
      ) : null}
      {state === "saved" ? (
        <p
          role="status"
          className="rounded-xl bg-success/15 px-3.5 py-2.5 text-sm text-success"
        >
          Profile saved.
        </p>
      ) : null}

      <div className="flex flex-col gap-1">
        <label htmlFor="settings-display-name" className="text-sm font-medium text-fg">
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
          className="focus-ring w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg placeholder:text-fg-muted"
        />
        {fieldErrors.display_name ? (
          <p id="settings-display-name-error" className="text-xs text-danger">
            {fieldErrors.display_name}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="settings-bio" className="text-sm font-medium text-fg">
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
          className="focus-ring w-full resize-y rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg placeholder:text-fg-muted"
        />
        {fieldErrors.bio ? (
          <p id="settings-bio-error" className="text-xs text-danger">
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
          className="focus-ring mt-0.5 h-4 w-4 rounded border-border accent-accent"
        />
        <div className="flex flex-col">
          <label htmlFor="settings-unlisted" className="text-sm font-medium text-fg">
            Hide my account from discovery
          </label>
          <span id="settings-unlisted-help" className="text-xs text-fg-muted">
            Your channels and videos stay reachable by direct link but no longer appear in the
            public feed or search on this instance.
          </span>
        </div>
      </div>

      <button
        type="submit"
        disabled={state === "saving"}
        className="focus-ring self-start rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent/90 disabled:opacity-60"
      >
        {state === "saving" ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
