"use client";

import { useId, useState } from "react";

import { LockIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { ApiError, api } from "@/lib/api";
import { cn } from "@/lib/cn";

// The messages a viewer sees for the two expected unlock rejections. A wrong
// password is an inline field error; hitting the (login-strict) rate limit is a
// calmer "wait a moment" note. Anything else falls back to the generic line.
const WRONG_PASSWORD = "That password is incorrect.";
const RATE_LIMITED = "Too many attempts. Please wait a moment and try again.";
const GENERIC = "Could not unlock this video. Please try again.";

/**
 * PasswordUnlockPanel is the CORE-17 unlock prompt shown in place of the player
 * when GET /videos/{id} answers 401 `password_required`. It POSTs the entered
 * password to /videos/{id}/unlock and, on success, hands the minted playback
 * token to `onUnlocked` (the watch/embed surface stores it in memory and
 * refetches the detail with it). Wrong password → an inline field error; 429 →
 * the rate-limit note. The password is a controlled field that is never logged,
 * and the token never touches this component's own state — it flows straight up.
 *
 * The "watch" variant is a token-styled page card; the "embed" variant is a
 * compact panel on the black iframe surface (media-overlay white-on-dark, a
 * documented exception) so it reads inside a small frame.
 */
export function PasswordUnlockPanel({
  videoId,
  onUnlocked,
  variant = "watch",
}: {
  videoId: string;
  onUnlocked: (playbackToken: string) => void;
  variant?: "watch" | "embed";
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const embed = variant === "embed";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || password === "") return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.unlockVideo(videoId, password);
      // Hand the token up (stored in the in-memory playback-token store there);
      // clear the field so the plaintext does not linger in component state.
      setPassword("");
      onUnlocked(res.playback_token);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setError(WRONG_PASSWORD);
      else if (err instanceof ApiError && err.status === 429) setError(RATE_LIMITED);
      else setError(GENERIC);
      setBusy(false);
    }
  }

  return (
    <div
      className={cn(
        "flex w-full flex-col items-center justify-center text-center",
        embed
          ? "h-full gap-3 bg-black px-6 text-white"
          : "aspect-video gap-4 rounded-2xl bg-surface-muted px-6 py-8",
      )}
    >
      <span
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-full",
          embed ? "bg-white/10 text-white" : "bg-surface-strong text-fg",
        )}
      >
        <LockIcon size={22} aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <p className={cn("text-[15px] font-semibold", embed ? "text-white" : "text-fg")}>
          This video is password protected
        </p>
        <p className={cn("text-[13px]", embed ? "text-white/70" : "text-fg-muted")}>
          Enter the password to watch it.
        </p>
      </div>
      <form onSubmit={submit} className="flex w-full max-w-xs flex-col gap-2">
        <label htmlFor={inputId} className="sr-only">
          Video password
        </label>
        <input
          id={inputId}
          type="password"
          autoComplete="off"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (error) setError(null);
          }}
          disabled={busy}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          placeholder="Password"
          className={cn(
            "focus-ring w-full rounded-xl border px-3.5 py-2 text-sm disabled:opacity-60",
            embed
              ? "border-white/20 bg-white/10 text-white placeholder:text-white/50"
              : "border-border bg-surface text-fg placeholder:text-fg-muted",
            error ? (embed ? "border-white/60" : "border-danger") : null,
          )}
        />
        {error ? (
          <p
            id={errorId}
            role="alert"
            className={cn("text-xs", embed ? "text-white/90" : "text-danger")}
          >
            {error}
          </p>
        ) : null}
        <Button
          type="submit"
          size="sm"
          disabled={busy || password === ""}
          className={cn("w-full", embed ? "bg-white text-black hover:bg-white/90" : null)}
        >
          {busy ? "Unlocking…" : "Unlock"}
        </Button>
      </form>
    </div>
  );
}
