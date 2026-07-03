"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { ProtocolBadge } from "@/components/ProtocolBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { Toggle } from "@/components/ui/Toggle";
import { ApiError, api } from "@/lib/api";
import type { ATProtoLinkRequest, ATProtoStatus } from "@/lib/api";
import { relativeTime } from "@/lib/format";

// The official Bluesky app-passwords settings page. An app password is a
// scoped, revocable credential distinct from the main account password.
const APP_PASSWORD_HELP_URL = "https://bsky.app/settings/app-passwords";

const INPUT =
  "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900";
const PRIMARY_BTN =
  "self-start rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300";
const SECONDARY_BTN =
  "rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800";
const DANGER_BTN =
  "rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-60 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30";

type Phase = "loading" | "error" | "disabled" | "ready";

// ConnectionsView is the /settings/connections surface: the accounts on OTHER
// networks that Vidra can post to on your behalf. Today that is Bluesky
// (ATProto, P11 extension) — outbound cross-posting only. Session-gated like the
// rest of settings (the session lives in memory; a hard reload lands here signed
// out until the refresh cookie restores it).
export function ConnectionsView() {
  const { status } = useSession();

  if (status === "restoring") {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading your account" />
      </div>
    );
  }
  if (status !== "authed") {
    return (
      <EmptyState
        title="Sign in to manage connected accounts"
        message={
          <>
            <Link href="/login" className="underline hover:text-zinc-700 dark:hover:text-zinc-200">
              Sign in
            </Link>{" "}
            to connect a Bluesky account for cross-posting.
          </>
        }
      />
    );
  }

  return <BlueskySection />;
}

// BlueskySection owns the loaded ATProto link state. GET /me/atproto answers
// 200 (linked), 404 (not linked → show the connect form), or 503 (the extension
// is disabled on this instance → an honest not-available state, no form).
function BlueskySection() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [account, setAccount] = useState<ATProtoStatus | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getATProtoAccount(controller.signal)
      .then((res) => {
        setAccount(res);
        setPhase("ready");
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 404) {
          setAccount(null);
          setPhase("ready");
        } else if (err instanceof ApiError && err.status === 503) {
          setPhase("disabled");
        } else {
          setPhase("error");
        }
      });
    return () => controller.abort();
  }, [reloadKey]);

  function retry() {
    setPhase("loading");
    setReloadKey((k) => k + 1);
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Bluesky</h2>
        <ProtocolBadge protocol="atproto" />
      </div>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Connect a Bluesky account so Vidra can announce your newly published{" "}
        <span className="font-medium">public</span> videos there. Cross-posting is outbound only —
        Vidra never reads your Bluesky feed, and posting happens automatically on publish (there is
        nothing else to post here).
      </p>

      {phase === "loading" ? (
        <div className="flex justify-center py-10">
          <Spinner label="Loading your Bluesky connection" />
        </div>
      ) : phase === "error" ? (
        <ErrorState message="Could not load your Bluesky connection." onRetry={retry} />
      ) : phase === "disabled" ? (
        <p
          className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400"
          data-testid="atproto-disabled"
        >
          Bluesky cross-posting isn&rsquo;t enabled on this instance. Ask your administrator to turn
          on the ATProto extension if you&rsquo;d like to use it.
        </p>
      ) : account ? (
        <BlueskyStatus
          account={account}
          onChanged={setAccount}
          onUnlinked={() => setAccount(null)}
          onDisabled={() => setPhase("disabled")}
        />
      ) : (
        <BlueskyConnect onLinked={setAccount} onDisabled={() => setPhase("disabled")} />
      )}
    </section>
  );
}

// mapLinkError turns the ATProto PUT failure statuses into honest, actionable
// copy. 503 is handled by the caller (it flips the whole section to disabled).
function mapLinkError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 422) {
      // The backend rejects a bad handle, a bad app password, or a
      // non-https/private PDS. Surface its message and reinforce the most
      // common mistake — using the main password instead of an app password.
      const detail = err.message?.trim();
      return detail && detail.toLowerCase() !== "unprocessable entity"
        ? `${detail} Make sure you used a Bluesky app password, not your main password.`
        : "Bluesky rejected those details. Check your handle and that you used an app password (Settings → App Passwords), not your main password.";
    }
    if (err.status === 502) {
      return "Couldn't reach Bluesky just now. Please try again in a moment.";
    }
    return err.message || "Something went wrong. Please try again.";
  }
  return "Something went wrong. Please try again.";
}

// AppPasswordHelp is the shared, prominent guidance that the credential is an
// APP password, never the main password (reused by the connect form and the
// auto-post re-auth confirm).
function AppPasswordHelp() {
  return (
    <p className="text-xs text-zinc-500 dark:text-zinc-400">
      Use a Bluesky <span className="font-semibold text-zinc-700 dark:text-zinc-300">app password</span> —{" "}
      <span className="font-medium">not your main password</span>. Create one under Bluesky
      Settings &rarr; App Passwords.{" "}
      <a
        href={APP_PASSWORD_HELP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-zinc-700 dark:hover:text-zinc-200"
      >
        Create an app password
      </a>
      .
    </p>
  );
}

// BlueskyConnect is the link/re-link form. `initial*` seed a re-connect from the
// current status; the app password is always re-entered (the backend never
// returns it and re-verifies on every write).
function BlueskyConnect({
  initialHandle = "",
  initialAutoPost = true,
  reconnect = false,
  onLinked,
  onDisabled,
  onCancel,
}: {
  initialHandle?: string;
  initialAutoPost?: boolean;
  reconnect?: boolean;
  onLinked: (status: ATProtoStatus) => void;
  onDisabled: () => void;
  onCancel?: () => void;
}) {
  const [handle, setHandle] = useState(initialHandle);
  const [appPassword, setAppPassword] = useState("");
  const [pds, setPds] = useState("");
  const [autoPost, setAutoPost] = useState(initialAutoPost);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (handle.trim() === "") {
      setError("Enter your Bluesky handle, e.g. alice.bsky.social.");
      return;
    }
    if (appPassword.trim() === "") {
      setError("Enter your Bluesky app password.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const body: ATProtoLinkRequest = {
      handle: handle.trim(),
      app_password: appPassword.trim(),
      auto_post: autoPost,
      ...(pds.trim() ? { pds_url: pds.trim() } : {}),
    };
    try {
      const status = await api.linkATProtoAccount(body);
      onLinked(status);
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        onDisabled();
        return;
      }
      setError(mapLinkError(err));
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
      className="flex max-w-xl flex-col gap-4"
      aria-label={reconnect ? "Reconnect your Bluesky account" : "Connect a Bluesky account"}
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
        <label htmlFor="atproto-handle" className="text-sm font-medium">
          Bluesky handle
        </label>
        <input
          id="atproto-handle"
          type="text"
          spellCheck={false}
          autoComplete="off"
          maxLength={253}
          value={handle}
          placeholder="alice.bsky.social"
          onChange={(e) => {
            setHandle(e.target.value);
            setError(null);
          }}
          className={INPUT}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="atproto-app-password" className="text-sm font-medium">
          App password
        </label>
        <input
          id="atproto-app-password"
          type="password"
          autoComplete="off"
          value={appPassword}
          placeholder="xxxx-xxxx-xxxx-xxxx"
          onChange={(e) => {
            setAppPassword(e.target.value);
            setError(null);
          }}
          aria-describedby="atproto-app-password-help"
          className={`${INPUT} font-mono`}
        />
        <span id="atproto-app-password-help">
          <AppPasswordHelp />
        </span>
      </div>

      <div className="flex items-start gap-3">
        <Toggle
          checked={autoPost}
          onChange={setAutoPost}
          label="Automatically post new public videos to Bluesky"
        />
        <div className="flex flex-col">
          <span className="text-sm font-medium">Auto-post new public videos</span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            When on, each new public video you publish is announced on Bluesky. Unlisted and private
            videos are never posted.
          </span>
        </div>
      </div>

      <details className="text-sm text-zinc-600 dark:text-zinc-400">
        <summary className="cursor-pointer select-none font-medium text-zinc-700 dark:text-zinc-300">
          Advanced: custom PDS
        </summary>
        <div className="mt-2 flex flex-col gap-1">
          <label htmlFor="atproto-pds" className="text-sm font-medium">
            PDS URL <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
          </label>
          <input
            id="atproto-pds"
            type="url"
            spellCheck={false}
            autoComplete="off"
            maxLength={2000}
            value={pds}
            placeholder="https://bsky.social"
            onChange={(e) => {
              setPds(e.target.value);
              setError(null);
            }}
            className={INPUT}
          />
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Leave blank for the default (bsky.social). Must be an https, public address.
          </span>
        </div>
      </details>

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={submitting} className={PRIMARY_BTN}>
          {submitting
            ? reconnect
              ? "Saving…"
              : "Connecting…"
            : reconnect
              ? "Save changes"
              : "Connect Bluesky"}
        </button>
        {onCancel ? (
          <button type="button" disabled={submitting} onClick={onCancel} className={SECONDARY_BTN}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

// BlueskyStatus is the linked view: identity, PDS, last-post, and the auto-post
// switch. Because the only write is PUT (which re-verifies credentials), flipping
// the switch reveals a confirm that re-collects the app password — the backend
// never re-exposes the sealed one. "Reconnect" reopens the full form; "Unlink"
// removes the connection.
function BlueskyStatus({
  account,
  onChanged,
  onUnlinked,
  onDisabled,
}: {
  account: ATProtoStatus;
  onChanged: (status: ATProtoStatus) => void;
  onUnlinked: () => void;
  onDisabled: () => void;
}) {
  const [reconnecting, setReconnecting] = useState(false);

  if (reconnecting) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Reconnect <span className="font-medium">@{account.handle}</span> or link a different
          account. Enter your app password to confirm.
        </p>
        <BlueskyConnect
          reconnect
          initialHandle={account.handle}
          initialAutoPost={account.auto_post}
          onLinked={(status) => {
            onChanged(status);
            setReconnecting(false);
          }}
          onCancel={() => setReconnecting(false)}
          onDisabled={onDisabled}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            @{account.handle}
          </span>
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-950/50 dark:text-green-300">
            Connected
          </span>
        </div>
        <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
          <dt className="font-medium">DID</dt>
          <dd className="truncate font-mono" title={account.did}>
            {account.did}
          </dd>
          <dt className="font-medium">PDS</dt>
          <dd className="truncate">{account.pds_url}</dd>
          <dt className="font-medium">Last post</dt>
          <dd>
            {account.last_posted_at
              ? relativeTime(account.last_posted_at)
              : "No videos announced yet"}
          </dd>
          <dt className="font-medium">Connected</dt>
          <dd>{relativeTime(account.created_at)}</dd>
        </dl>
      </div>

      <AutoPostControl account={account} onChanged={onChanged} onDisabled={onDisabled} />

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setReconnecting(true)} className={SECONDARY_BTN}>
          Reconnect
        </button>
        <UnlinkControl onUnlinked={onUnlinked} onDisabled={onDisabled} />
      </div>
    </div>
  );
}

// AutoPostControl is the always-visible auto-post switch. Flipping it (so it
// differs from the saved value) reveals an app-password confirm, because the
// backend re-verifies credentials on every write.
function AutoPostControl({
  account,
  onChanged,
  onDisabled,
}: {
  account: ATProtoStatus;
  onChanged: (status: ATProtoStatus) => void;
  onDisabled: () => void;
}) {
  const [autoPost, setAutoPost] = useState(account.auto_post);
  const [appPassword, setAppPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = autoPost !== account.auto_post;

  function cancel() {
    setAutoPost(account.auto_post);
    setAppPassword("");
    setError(null);
  }

  async function save() {
    if (appPassword.trim() === "") {
      setError("Enter your app password to change auto-posting.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const status = await api.linkATProtoAccount({
        handle: account.handle,
        app_password: appPassword.trim(),
        auto_post: autoPost,
      });
      onChanged(status);
      setAppPassword("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        onDisabled();
        return;
      }
      setError(mapLinkError(err));
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <Toggle
          checked={autoPost}
          onChange={(next) => {
            setAutoPost(next);
            setError(null);
          }}
          disabled={saving}
          label="Automatically post new public videos to Bluesky"
        />
        <div className="flex flex-col">
          <span className="text-sm font-medium">Auto-post new public videos</span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {account.auto_post
              ? "On — new public videos are announced on Bluesky."
              : "Off — nothing is posted automatically."}
          </span>
        </div>
      </div>

      {dirty ? (
        <div className="flex max-w-md flex-col gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
          <div className="flex flex-col gap-1">
            <label htmlFor="atproto-autopost-password" className="text-sm font-medium">
              Confirm your app password to {autoPost ? "turn on" : "turn off"} auto-posting
            </label>
            <input
              id="atproto-autopost-password"
              type="password"
              autoComplete="off"
              value={appPassword}
              placeholder="xxxx-xxxx-xxxx-xxxx"
              onChange={(e) => {
                setAppPassword(e.target.value);
                setError(null);
              }}
              className={`${INPUT} font-mono`}
            />
            <AppPasswordHelp />
          </div>
          {error ? (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={saving} onClick={() => void save()} className={PRIMARY_BTN}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" disabled={saving} onClick={cancel} className={SECONDARY_BTN}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// UnlinkControl removes the Bluesky connection behind a one-tap confirm so it is
// not fired by accident. Unlinking is reversible (just reconnect), so no
// password is required — the backend authorises it from the session alone.
function UnlinkControl({
  onUnlinked,
  onDisabled,
}: {
  onUnlinked: () => void;
  onDisabled: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unlink() {
    setBusy(true);
    setError(null);
    try {
      await api.unlinkATProtoAccount();
      onUnlinked();
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        onDisabled();
        return;
      }
      setError(err instanceof ApiError ? err.message : "Could not unlink. Please try again.");
      setBusy(false);
    }
  }

  if (!armed) {
    return (
      <button type="button" onClick={() => setArmed(true)} className={DANGER_BTN}>
        Unlink
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          Unlink Bluesky? Auto-posting stops immediately.
        </span>
        <button type="button" disabled={busy} onClick={() => void unlink()} className={DANGER_BTN}>
          {busy ? "Unlinking…" : "Unlink"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setArmed(false);
            setError(null);
          }}
          className={SECONDARY_BTN}
        >
          Cancel
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
