"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { AccountDataSection } from "@/components/auth/AccountDataSection";
import { useSession } from "@/components/auth/AuthProvider";
import { BlueskyVisibilityToggle } from "@/components/auth/BlueskyVisibilityToggle";
import { ConnectedLogins } from "@/components/auth/ConnectedLogins";
import { ChevronRightIcon } from "@/components/icons";
import { ProfileImageManager } from "@/components/ProfileImageManager";
import { SETTINGS_GROUPS, type SettingsSection } from "@/components/settings/sections";
import { Alert } from "@/components/ui/Alert";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconTile } from "@/components/ui/IconTile";
import { ApiError, api, authApi, errorMessage, userAvatarUrl, userBannerUrl } from "@/lib/api";
import type { UpdateProfileRequest, User } from "@/lib/api";
import { SignInGate } from "@/components/SignInGate";

// SettingsGroup is one iOS-style grouped block: an uppercase micro group-header
// (design-system group-header spec) above a surface-muted rounded card whose
// rows are hairline-divided. No `overflow-hidden` (it would clip the row links'
// box-shadow focus ring) — the first/last row links round themselves to the
// card corners instead.
function SettingsGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-xs font-bold uppercase tracking-[0.06em] text-fg-muted">
        {label}
      </h2>
      <ul className="flex flex-col divide-y divide-border-subtle rounded-2xl bg-surface-muted [&>li:first-child>a]:rounded-t-2xl [&>li:last-child>a]:rounded-b-2xl">
        {children}
      </ul>
    </section>
  );
}

// SettingsNavRow is one navigation row: a leading colored IconTile (System
// Settings pattern), a Subhead title + Footnote sub-line, and a trailing
// chevron. The exact "Manage …" name each sub-page's e2e navigates by is carried
// as sr-only text INSIDE the link, so the link's name-from-content includes it
// (keeps every getByRole("link", { name: "Manage …" }) green) without an
// aria-label — an aria-label would trip axe's label-content-name-mismatch
// against the visible sub-line. Both this row and the desktop SettingsRail are
// fed by the shared section catalog, so their hue/route/name never diverge.
function SettingsNavRow({ href, action, title, desc, color, Icon }: SettingsSection) {
  return (
    <li>
      <Link
        href={href}
        className="focus-ring flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-strong"
      >
        <IconTile color={color}>
          <Icon size={16} />
        </IconTile>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-fg">{title}</span>
          <span className="mt-0.5 block text-[13px] text-fg-muted">{desc}</span>
        </span>
        <span className="sr-only">{action}</span>
        <ChevronRightIcon size={18} className="shrink-0 text-fg-subtle" />
      </Link>
    </li>
  );
}

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

  if (status === "anon" || !user) {
    return (
      <SignInGate
        title="Sign in to manage your account"
        lead="Your session has ended."
        restoringLabel="Loading your account"
      >
        to edit your profile.
      </SignInGate>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Profile header — the design's account identity row: a 56px avatar
          (real image, else initial fallback) beside the display name and the
          "@handle · email · verified" identity line (verified in success). */}
      <header className="flex flex-col gap-4 border-b border-border-subtle pb-5">
        <h1 className="text-title sm:text-large-title">Account settings</h1>
        <div className="flex items-center gap-3.5">
          <Avatar
            src={userAvatarUrl(user.id)}
            name={user.display_name || user.username}
            className="h-14 w-14 text-xl"
          />
          <div className="min-w-0">
            <p className="truncate text-[17px] font-bold text-fg">
              {user.display_name || user.username}
            </p>
            <p className="truncate text-[13px] text-fg-muted">
              @{user.username} · {user.email}
              {user.email_verified ? (
                <span className="font-medium text-success"> · verified</span>
              ) : null}
            </p>
          </div>
        </div>
      </header>
      {user.email_verified ? null : <EmailVerificationSection email={user.email} />}
      <ProfileForm
        key={user.id}
        initialDisplayName={user.display_name}
        initialBio={user.bio}
        initialUnlisted={user.unlisted ?? false}
        initialHistoryEnabled={user.history_enabled ?? true}
        initialProfilePublic={user.profile_public}
        updateProfile={updateProfile}
      />
      <ProfileImagesSection
        key={`images-${user.id}`}
        user={user}
        onChanged={() => void reloadUser().catch(() => {})}
      />
      {/* Section navigation — the iOS grouped-rows drill-in (System Settings
          pattern): surface-muted cards of hairline-divided full-row links, each
          led by a colored IconTile. On ≥ lg the SettingsRail (left) is the
          section nav, so these collapse to avoid a duplicate nav. */}
      <div className="flex flex-col gap-6 lg:hidden">
        {SETTINGS_GROUPS.map((group) => (
          <SettingsGroup key={group.label} label={group.label}>
            {group.items.map((item) => (
              <SettingsNavRow key={item.href} {...item} />
            ))}
          </SettingsGroup>
        ))}
      </div>
      <ConnectedLogins />
      <BlueskyVisibilityToggle />
      <AccountDataSection />
      {/* Header sign-out is hidden on phones (the avatar is the only account
          control there), so settings must offer it — the design's full-width
          outline "Sign out". Its accessible name carries " of this device"
          (sr-only) so it never collides with the header's exact "Sign out". */}
      <button
        type="button"
        onClick={() => {
          void logout();
        }}
        className="focus-ring w-full rounded-[10px] border border-border bg-transparent py-3 text-sm font-semibold text-fg transition-colors hover:bg-surface-muted"
      >
        Sign out<span className="sr-only"> of this device</span>
      </button>
      {/* Danger zone — the reversible + irreversible account destructions
          grouped under one header for a consistent, hard-to-mistake block. */}
      <section className="flex flex-col gap-3">
        <h2 className="px-1 text-xs font-bold uppercase tracking-[0.06em] text-danger">
          Danger zone
        </h2>
        <DeactivateSection deactivate={deactivate} />
        <DeleteAccountSection
          username={user.username}
          deleteAccount={deleteAccount}
          onDeleted={() => setDeleted(true)}
        />
      </section>
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
    <section className="flex max-w-xl flex-col gap-3 rounded-2xl border border-warning-solid/25 bg-warning-solid/12 p-4">
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
        <Alert>
          {error}
        </Alert>
      ) : null}
      {state === "sent" ? (
        <Alert variant="success">
          Verification email sent. Check your inbox.
        </Alert>
      ) : (
        <button
          type="button"
          onClick={() => void resend()}
          disabled={state === "sending"}
          className="focus-ring self-start rounded-[10px] border border-warning-solid/40 bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-warning transition-colors hover:bg-warning-solid/12 disabled:opacity-60"
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
          <Alert>
            {error}
          </Alert>
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
        {/* Deactivate is the reversible action, so it takes the lower-emphasis
            danger-OUTLINE treatment; permanent deletion below carries the solid
            fill (danger-zone hierarchy — design-review). */}
        <button
          type="submit"
          disabled={submitting || password === ""}
          className="focus-ring self-start rounded-[10px] border border-danger/45 px-4 py-2 text-sm font-semibold text-danger transition-colors hover:bg-danger/10 disabled:opacity-60"
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
          className="focus-ring self-start rounded-[10px] bg-danger-solid px-4 py-2 text-sm font-semibold text-danger-fg transition-colors hover:bg-danger-solid/90"
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
            <Alert>
              {error}
            </Alert>
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
              className="focus-ring rounded-[10px] bg-danger-solid px-4 py-2 text-sm font-semibold text-danger-fg transition-colors hover:bg-danger-solid/90 disabled:opacity-60"
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
              className="focus-ring rounded-[10px] border border-border bg-surface px-4 py-2 text-sm font-semibold text-fg transition-colors hover:bg-surface-muted disabled:opacity-60"
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
  initialHistoryEnabled,
  initialProfilePublic,
  updateProfile,
}: {
  initialDisplayName: string;
  initialBio: string;
  initialUnlisted: boolean;
  initialHistoryEnabled: boolean;
  initialProfilePublic: boolean;
  updateProfile: (input: UpdateProfileRequest) => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [bio, setBio] = useState(initialBio);
  const [unlisted, setUnlisted] = useState(initialUnlisted);
  const [historyEnabled, setHistoryEnabled] = useState(initialHistoryEnabled);
  const [profilePublic, setProfilePublic] = useState(initialProfilePublic);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");

  async function submit() {
    setFieldErrors({});
    setFormError(null);
    setState("saving");
    try {
      await updateProfile({
        display_name: displayName,
        bio,
        unlisted,
        history_enabled: historyEnabled,
        profile_public: profilePublic,
      });
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
        <Alert>
          {formError}
        </Alert>
      ) : null}
      {state === "saved" ? (
        <Alert variant="success">
          Profile saved.
        </Alert>
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
          id="settings-profile-public"
          name="settings-profile-public"
          type="checkbox"
          checked={profilePublic}
          onChange={(e) => {
            setProfilePublic(e.target.checked);
            setState("idle");
          }}
          aria-describedby="settings-profile-public-help"
          className="focus-ring mt-0.5 h-4 w-4 rounded border-border accent-accent"
        />
        <div className="flex flex-col">
          <label htmlFor="settings-profile-public" className="text-sm font-medium text-fg">
            Make my profile public
          </label>
          <span id="settings-profile-public-help" className="text-xs text-fg-muted">
            Your profile introduces you and links your publishing channels. When off, visitors get
            a 404; you can still preview it while signed in.
          </span>
        </div>
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

      <div className="flex items-start gap-2">
        <input
          id="settings-history-enabled"
          name="settings-history-enabled"
          type="checkbox"
          checked={historyEnabled}
          onChange={(e) => {
            setHistoryEnabled(e.target.checked);
            setState("idle");
          }}
          aria-describedby="settings-history-enabled-help"
          className="focus-ring mt-0.5 h-4 w-4 rounded border-border accent-accent"
        />
        <div className="flex flex-col">
          <label htmlFor="settings-history-enabled" className="text-sm font-medium text-fg">
            Keep my watch history
          </label>
          <span id="settings-history-enabled-help" className="text-xs text-fg-muted">
            While off, videos you watch are not recorded and resume positions are not saved.
            Entries already in your history are kept — clear them from the History page.
          </span>
        </div>
      </div>

      <button
        type="submit"
        disabled={state === "saving"}
        className="focus-ring self-start rounded-[10px] bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent/90 disabled:opacity-60"
      >
        {state === "saving" ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
