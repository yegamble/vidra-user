"use client";

import { useEffect, useState } from "react";

import { providerDisplayName } from "@/components/auth/OAuthButtons";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, authApi } from "@/lib/api";
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
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true);
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
      } else if (err instanceof ApiError) {
        setActionError(err.message);
      } else {
        setActionError("Something went wrong. Please try again.");
      }
    } finally {
      setUnlinking(null);
    }
  }

  return (
    <section className="flex max-w-xl flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Connected logins
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          External accounts you can use to sign in here.
        </p>
      </div>

      {actionError ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
        >
          {actionError}
        </p>
      ) : null}

      {loadError ? (
        <div className="flex items-center gap-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-400" role="alert">
            Could not load your connected logins.
          </p>
          <button
            type="button"
            onClick={() => {
              setLoadError(false);
              setReloadKey((k) => k + 1);
            }}
            className="rounded-md border border-zinc-300 px-2.5 py-1 text-sm text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Retry
          </button>
        </div>
      ) : identities === null ? (
        <div className="flex justify-center py-2">
          <Spinner label="Loading connected logins" />
        </div>
      ) : identities.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No external logins are linked to this account.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {identities.map((identity) => (
            <li key={identity.provider} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {providerDisplayName(identity.provider)}
                </p>
                <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {identity.email || "no email recorded"} · linked{" "}
                  {new Date(identity.created_at).toLocaleDateString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void unlink(identity.provider)}
                disabled={unlinking !== null}
                aria-label={`Unlink ${providerDisplayName(identity.provider)}`}
                className="shrink-0 rounded-md border border-zinc-300 px-2.5 py-1 text-sm text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
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
