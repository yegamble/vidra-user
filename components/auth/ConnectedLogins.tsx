"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { providerDisplayName } from "@/components/auth/OAuthButtons";
import { Alert } from "@/components/ui/Alert";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api, authApi, errorMessage } from "@/lib/api";
import type { OAuthIdentity } from "@/lib/api";
import { useSettledSession } from "@/lib/use-settled-session";

// ConnectedLogins is the /settings "Connected logins" section: every sign-in
// provider this instance offers, each either connected (with an Unlink control)
// or not (with a Connect one).
//
// The Connect half is not a convenience. A provider's word about an email
// address no longer links anything — an id_token whose address matches an
// existing account is refused outright, because an identity provider asserting
// "this person owns alice@example.com" is not evidence that alice consented to
// hand over her Vidra account. That refusal would strand a real person if
// there were no other way to connect a provider, so this is that way: the
// account holder does it here, signed in, and the backend binds the attempt to
// this session.
//
// The backend refuses (422) to remove the account's LAST sign-in method — that
// answer is surfaced honestly with the set-a-password remedy instead of being
// swallowed.

// Which account does this identity sign me in as? An OIDC identity answers with
// its verified email; an ATProto one has no email BY DESIGN (the synthetic
// address is deliberately non-routable) and answers with its handle. Falling
// back to "no email recorded" for ATProto threw away the row's only content.
function identityLabel(identity: OAuthIdentity): string {
  if (identity.handle) return `@${identity.handle}`;
  return identity.email || "no email recorded";
}

/**
 * Honest copy for the ?link_error=<code> the callback redirects back with. A
 * link is not a sign-in, so these are a separate vocabulary from
 * oauthErrorMessage — and the first one is the whole point of the flow: it
 * REFUSES rather than moving an identity between accounts.
 */
export function linkErrorMessage(code: string): string {
  switch (code) {
    case "identity_belongs_to_another_account":
      return "That provider account is already connected to a different account here. Sign in as that account, or disconnect it there first.";
    case "provider_already_linked":
      return "That provider is already connected to this account. Disconnect it before connecting a different one.";
    case "account_disabled":
      return "This account is disabled.";
    case "atproto_disabled":
      return "Bluesky sign-in is not enabled on this instance.";
    case "atproto_upstream":
      return "Could not reach your Bluesky server. Try again shortly.";
    case "atproto_identity_mismatch":
      return "That Bluesky sign-in could not be verified. Try again.";
    case "oauth_exchange_failed":
      return "The provider did not complete the connection. Try again.";
    default:
      return "Connecting that provider did not work. Please try again.";
  }
}

export function ConnectedLogins() {
  const router = useRouter();
  const params = useSearchParams();
  // Every read here is viewer-scoped, so it waits for the session to settle
  // rather than firing before the boot silent-refresh has decided (the
  // fetch-before-restore class this codebase has been bitten by repeatedly).
  const { settled, authed } = useSettledSession();
  // The callback's one-shot outcome markers. Read at INITIALISATION, not in an
  // effect: the effect below strips them from the URL immediately, so state
  // derived from them has to be sticky, and setState inside an effect body is
  // the cascading-render pattern the lint rule (rightly) refuses.
  const linked = params.get("link");
  const linkError = params.get("link_error");
  const [identities, setIdentities] = useState<OAuthIdentity[] | null>(null);
  const [providers, setProviders] = useState<string[]>([]);
  const [atprotoEnabled, setAtprotoEnabled] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(
    linkError ? linkErrorMessage(linkError) : null,
  );
  const [notice, setNotice] = useState<string | null>(
    linked ? `${providerDisplayName(linked)} is now connected to this account.` : null,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Bluesky is the one provider that needs an input before the handoff: the
  // instance does not know WHICH PDS account you mean until you say.
  const [handleOpen, setHandleOpen] = useState(false);
  const [handle, setHandle] = useState("");

  // Clean the one-shot markers out of the URL: they must not survive a reload
  // or a bookmark. The outcome already lives in state above.
  useEffect(() => {
    if (linked || linkError) router.replace("/settings");
  }, [linked, linkError, router]);

  useEffect(() => {
    if (!settled || !authed) return;
    const controller = new AbortController();
    authApi
      .listOAuthIdentities(controller.signal)
      .then((res) => setIdentities(res.identities))
      .catch((err) => {
        if (controller.signal.aborted) return;
        // A 404 means this instance has no OIDC providers configured, so the
        // endpoint isn't mounted — there are genuinely no external logins to
        // link. Show the honest empty state instead of a transient-looking error.
        if (err instanceof ApiError && err.status === 404) {
          setIdentities([]);
        } else {
          setLoadError(true);
        }
      });
    return () => controller.abort();
  }, [reloadKey, settled, authed]);

  // What this instance OFFERS, which is a different question from what this
  // account has connected: a provider with no identity is exactly the row that
  // needs a Connect control.
  useEffect(() => {
    const controller = new AbortController();
    api
      .getInstance(controller.signal)
      .then((instance) => {
        setProviders(instance.oauth_providers ?? []);
        setAtprotoEnabled(instance.atproto_login ?? false);
      })
      .catch(() => {
        // No instance document — the list below still renders what is linked.
      });
    return () => controller.abort();
  }, []);

  async function unlink(provider: string) {
    setActionError(null);
    setNotice(null);
    setBusy(provider);
    try {
      await authApi.unlinkOAuthIdentity(provider);
      setIdentities((prev) => prev?.filter((i) => i.provider !== provider) ?? prev);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        // The remedy has to be one the user can reach. The reset flow is not:
        // this account's address is a generated one that cannot receive mail.
        setActionError(
          "This is your only way to sign in, so it can't be unlinked. Set a password first under “Finish securing your account” in Settings › Security, then unlink it.",
        );
      } else if (err instanceof ApiError && err.status === 404) {
        // Already gone (another tab/session) — reflect reality.
        setIdentities((prev) => prev?.filter((i) => i.provider !== provider) ?? prev);
      } else {
        setActionError(errorMessage(err));
      }
    } finally {
      setBusy(null);
    }
  }

  async function connect(provider: string) {
    setActionError(null);
    setNotice(null);
    setBusy(provider);
    try {
      // The start is a fetch (it must carry the bearer token); the handoff is a
      // TOP-LEVEL navigation, because the provider needs a real user agent and
      // the attempt is sealed into an httpOnly cookie the navigation carries.
      // Bluesky needs a handle first — it resolves the account before the
      // browser leaves, which is also why IT can refuse a collision up front.
      const { authorization_url } =
        provider === "atproto"
          ? await authApi.startATProtoLink(handle.trim(), "/settings")
          : await authApi.startOAuthLink(provider, "/settings");
      window.location.assign(authorization_url);
    } catch (err) {
      setBusy(null);
      if (err instanceof ApiError && err.status === 409) {
        setActionError(linkErrorMessage("identity_belongs_to_another_account"));
      } else if (err instanceof ApiError && err.status === 422) {
        setActionError(linkErrorMessage("provider_already_linked"));
      } else if (err instanceof ApiError && err.status === 503) {
        setActionError(
          provider === "atproto"
            ? linkErrorMessage("atproto_disabled")
            : "Single sign-on is not configured on this instance.",
        );
      } else {
        setActionError(errorMessage(err));
      }
    }
  }

  // Every provider the instance offers, plus any identity linked to a provider
  // it no longer offers — turning a provider off must not hide a connection the
  // account still has and can still unlink.
  const linkedProviders = identities ?? [];
  const offered = [...providers, ...(atprotoEnabled ? ["atproto"] : [])];
  const rows = [
    ...offered.map((provider) => ({
      provider,
      identity: linkedProviders.find((i) => i.provider === provider) ?? null,
    })),
    ...linkedProviders
      .filter((i) => !offered.includes(i.provider))
      .map((identity) => ({ provider: identity.provider, identity })),
  ];

  return (
    <section className="flex max-w-xl flex-col gap-3 rounded-2xl border border-border-subtle bg-surface p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold tracking-tight text-fg">
          Connected logins
        </h2>
        <p className="text-sm text-fg-muted">
          External accounts you can use to sign in here.
        </p>
      </div>

      {notice ? <Alert variant="success">{notice}</Alert> : null}
      {actionError ? <Alert>{actionError}</Alert> : null}

      {loadError ? (
        <div className="flex items-center gap-3">
          <p className="text-sm text-fg-muted" role="alert">
            Could not load your connected logins.
          </p>
          <button
            type="button"
            onClick={() => {
              setLoadError(false);
              setReloadKey((k) => k + 1);
            }}
            className="focus-ring rounded-full border border-border bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-muted"
          >
            Retry
          </button>
        </div>
      ) : identities === null ? (
        <div className="flex justify-center py-2">
          <Spinner label="Loading connected logins" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-fg-muted">
          This instance does not offer any external sign-in providers.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle">
          {rows.map(({ provider, identity }) => (
            <li key={provider} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-fg">
                  {providerDisplayName(provider)}
                </p>
                <p className="truncate text-[13px] text-fg-muted">
                  {identity
                    ? `${identityLabel(identity)} · linked ${new Date(identity.created_at).toLocaleDateString()}`
                    : "Not connected"}
                </p>
              </div>
              {identity ? (
                <button
                  type="button"
                  onClick={() => void unlink(provider)}
                  disabled={busy !== null}
                  aria-label={`Unlink ${providerDisplayName(provider)}`}
                  className="focus-ring shrink-0 rounded-full border border-border bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-muted disabled:opacity-60"
                >
                  {busy === provider ? "Unlinking…" : "Unlink"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (provider === "atproto" && !handleOpen) {
                      setHandleOpen(true);
                      return;
                    }
                    void connect(provider);
                  }}
                  disabled={busy !== null || (provider === "atproto" && handleOpen && handle.trim() === "")}
                  aria-label={`Connect ${providerDisplayName(provider)}`}
                  className="focus-ring shrink-0 rounded-full border border-border bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-muted disabled:opacity-60"
                >
                  {busy === provider ? "Connecting…" : "Connect"}
                </button>
              )}
            </li>
          ))}
          {handleOpen && !linkedProviders.some((i) => i.provider === "atproto") ? (
            <li className="py-2.5">
              <Input
                id="connect-bluesky-handle"
                name="connect-bluesky-handle"
                label="Bluesky or ATProto handle"
                autoComplete="off"
                autoFocus
                value={handle}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHandle(e.target.value)}
                placeholder="alice.bsky.social"
              />
            </li>
          ) : null}

        </ul>
      )}
    </section>
  );
}
