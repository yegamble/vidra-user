"use client";

import { useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { ApiError, authApi, errorMessage } from "@/lib/api";

// BlueskyVisibilityToggle is the /settings control that opts the account into
// showing its linked Bluesky/ATProto sign-in handle on the public profile
// (show_bluesky, persisted via PATCH /auth/me — the same mechanism as the
// profile_public toggle). It renders only when a Bluesky account is actually
// linked, and shows which handle would be revealed. Default: hidden (off).
export function BlueskyVisibilityToggle() {
  const { user, updateProfile } = useSession();
  const [handle, setHandle] = useState<string | null>(null);
  const [checked, setChecked] = useState<boolean>(user?.show_bluesky ?? false);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    authApi
      .listOAuthIdentities(controller.signal)
      .then((res) => {
        const linked = res.identities.find((i) => i.provider === "atproto" && i.handle);
        setHandle(linked?.handle ?? null);
      })
      .catch((err) => {
        // A 404 means no OIDC/ATProto providers are configured; anything else is
        // transient. Either way there is no handle to reveal, so show nothing.
        if (!(err instanceof ApiError)) return;
      });
    return () => controller.abort();
  }, []);

  // No linked Bluesky account → nothing to expose, so render nothing.
  if (!handle) return null;

  async function onToggle(next: boolean) {
    setChecked(next);
    setState("saving");
    setError(null);
    try {
      await updateProfile({ show_bluesky: next });
      setState("saved");
    } catch (err) {
      setChecked(!next); // revert the optimistic flip
      setState("idle");
      setError(errorMessage(err));
    }
  }

  return (
    <section className="flex max-w-xl flex-col gap-3 rounded-2xl border border-border-subtle bg-surface p-4">
      <div className="flex items-start gap-2">
        <input
          id="settings-show-bluesky"
          name="settings-show-bluesky"
          type="checkbox"
          checked={checked}
          onChange={(e) => void onToggle(e.target.checked)}
          aria-describedby="settings-show-bluesky-help"
          className="focus-ring mt-0.5 h-4 w-4 rounded border-border accent-accent"
        />
        <div className="flex min-w-0 flex-col">
          <label htmlFor="settings-show-bluesky" className="text-sm font-medium text-fg">
            Show my Bluesky handle on my public profile
          </label>
          <span id="settings-show-bluesky-help" className="text-xs text-fg-muted">
            Visitors to your public profile will see{" "}
            <span className="font-medium text-fg">@{handle}</span> linking to your Bluesky account.
          </span>
          {state === "saved" ? (
            <span role="status" className="mt-1 text-xs text-success">
              Saved.
            </span>
          ) : null}
          {error ? (
            <span role="alert" className="mt-1 text-xs text-danger">
              {error}
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}
