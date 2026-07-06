"use client";

import { useEffect, useState } from "react";

import { providerDisplayName } from "@/components/auth/OAuthButtons";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, authApi, errorMessage } from "@/lib/api";
import type { OAuthIdentity } from "@/lib/api";

// ConnectedLogins is the /settings "Connected logins" section: the OIDC
// identities linked to the account (GET /me/oauth-identities) with a per-row
// Unlink control. The backend refuses (422) to remove the account's LAST
// sign-in method — that answer is surfaced honestly with the password-first
// remedy instead of being swallowed.
export function ConnectedLogins() {
  const [identities, setIdentities] = useState<OAuthIdentity[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
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
  }, [reloadKey]);

  async function unlink(provider: string) {
    setActionError(null);
    setUnlinking(provider);
    try {
      await authApi.unlinkOAuthIdentity(provider);
      setIdentities((prev) => prev?.filter((i) => i.provider !== provider) ?? prev);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setActionError(
          "This is your only way to sign in, so it can't be unlinked. Set a password first (use the password-reset flow), then unlink it.",
        );
      } else if (err instanceof ApiError && err.status === 404) {
        // Already gone (another tab/session) — reflect reality.
        setIdentities((prev) => prev?.filter((i) => i.provider !== provider) ?? prev);
      } else {
        setActionError(errorMessage(err));
      }
    } finally {
      setUnlinking(null);
    }
  }

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

      {actionError ? (
        <p
          role="alert"
          className="rounded-xl border border-danger-border bg-danger-surface px-3.5 py-2.5 text-sm text-danger"
        >
          {actionError}
        </p>
      ) : null}

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
      ) : identities.length === 0 ? (
        <p className="text-sm text-fg-muted">
          No external logins are linked to this account.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle">
          {identities.map((identity) => (
            <li key={identity.provider} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-fg">
                  {providerDisplayName(identity.provider)}
                </p>
                <p className="truncate text-[13px] text-fg-muted">
                  {identity.email || "no email recorded"} · linked{" "}
                  {new Date(identity.created_at).toLocaleDateString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void unlink(identity.provider)}
                disabled={unlinking !== null}
                aria-label={`Unlink ${providerDisplayName(identity.provider)}`}
                className="focus-ring shrink-0 rounded-full border border-border bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-muted disabled:opacity-60"
              >
                {unlinking === identity.provider ? "Unlinking…" : "Unlink"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
