"use client";

import { useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { errorMessage } from "@/lib/api";
import type { SensitiveContentPolicy, UpdateProfileRequest } from "@/lib/api";
import { useInstanceSensitivePolicy } from "@/lib/use-sensitive-policy";
import { SignInGate } from "@/components/SignInGate";

type SaveState = "idle" | "saving" | "saved" | "error";

// The select value: the four real policies, plus "" meaning "inherit the
// instance default".
type PolicyChoice = SensitiveContentPolicy | "";

// Human-readable label for each policy (also used inside the "Use instance
// default (…)" option so the viewer knows what inheriting currently means).
const POLICY_LABEL: Record<SensitiveContentPolicy, string> = {
  display: "Show",
  warn: "Warn before playing",
  blur: "Blur previews",
  hide: "Hide from browse",
};

// ContentSettingsView is the "Sensitive content" account page: a single per-user
// override of the instance sensitive_content_policy (PATCH /auth/me), persisted
// as one of hide/warn/blur/display or an empty string (inherit). It mirrors the
// SearchSettingsView pattern — a settled signed-out session gets the sign-in
// prompt; a hard reload shows a loading state until the refresh cookie restores
// the session.
export function ContentSettingsView() {
  const { status, user } = useSession();

  if (status === "anon" || !user) {
    return (
      <SignInGate
        title="Sign in to manage your content settings"
        lead="Your session has ended."
        restoringLabel="Loading your settings"
      >
        to change how sensitive content is shown to you.
      </SignInGate>
    );
  }

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <SensitiveContentSection
        key={user.id}
        initial={(user.sensitive_content_policy ?? "") as PolicyChoice}
      />
    </div>
  );
}

// The single per-user sensitive-content override. Auto-saves the changed value
// (PATCH /auth/me) and reflects a polite saved-status line; a failed save
// reverts the selection and reports the error.
function SensitiveContentSection({ initial }: { initial: PolicyChoice }) {
  const { updateProfile } = useSession();
  // The raw INSTANCE policy powers the "Use instance default (…)" label so the
  // viewer sees what inheriting resolves to right now.
  const instancePolicy = useInstanceSensitivePolicy();
  const [choice, setChoice] = useState<PolicyChoice>(initial);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  const inheritLabel = instancePolicy
    ? `Use instance default (${POLICY_LABEL[instancePolicy]})`
    : "Use instance default";

  async function change(value: PolicyChoice) {
    const previous = choice;
    setChoice(value);
    setSaveState("saving");
    setError(null);
    try {
      // "" clears the override back to inherit; the four values set it.
      const patch: UpdateProfileRequest = { sensitive_content_policy: value };
      await updateProfile(patch);
      setSaveState("saved");
    } catch (err) {
      setChoice(previous);
      setSaveState("error");
      setError(errorMessage(err, "Could not save that change."));
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold tracking-tight text-fg">Sensitive content</h2>
        <p className="text-[13px] text-fg-muted">
          Choose how videos that creators or moderators flag as sensitive are
          shown to you across this instance. This overrides the instance default
          for your account only.
        </p>
      </div>

      {/* Polite, non-focus-stealing save status (design-system role=status line). */}
      <div role="status" aria-live="polite" className="min-h-5 text-[13px]">
        {saveState === "saving" ? <span className="text-fg-muted">Saving…</span> : null}
        {saveState === "saved" ? <span className="text-success">Saved.</span> : null}
        {saveState === "error" && error ? <span className="text-danger">{error}</span> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="sensitive-content-policy" className="text-sm font-medium text-fg">
          Show sensitive videos
        </label>
        <select
          id="sensitive-content-policy"
          name="sensitive-content-policy"
          value={choice}
          onChange={(e) => void change(e.target.value as PolicyChoice)}
          aria-describedby="sensitive-content-policy-help"
          className="focus-ring w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg"
        >
          <option value="">{inheritLabel}</option>
          <option value="display">{POLICY_LABEL.display}</option>
          <option value="warn">{POLICY_LABEL.warn}</option>
          <option value="blur">{POLICY_LABEL.blur}</option>
          <option value="hide">{POLICY_LABEL.hide}</option>
        </select>
        <span id="sensitive-content-policy-help" className="text-xs text-fg-muted">
          Warn asks you to confirm before a flagged video plays; Blur hides
          previews until you choose to watch; Hide keeps flagged videos out of
          your feed and search. Restricted Mode, when enabled from your account
          menu, still applies on this device and takes precedence.
        </span>
      </div>
    </section>
  );
}
