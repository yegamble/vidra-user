"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { api, errorMessage, fieldErrors } from "@/lib/api";
import type { AdminCreateUserResponse, UserRole } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

const ROLES: readonly { value: UserRole; label: string }[] = [
  { value: "user", label: "User" },
  { value: "moderator", label: "Moderator" },
  { value: "admin", label: "Admin" },
];

/**
 * CreateUserDialog — an admin creates an account directly (closed-registration
 * onboarding). There is no password field for the new account: core mints the
 * ordinary single-use set-password token and either emails it (`link_emailed`)
 * or returns it ONCE in `reset_url`. As with PasswordResetLinkCard, that link is
 * a credential, so it lives only in this dialog's state — never storage, URL,
 * toast or log — and is discarded when the dialog closes. The admin re-enters
 * their OWN password, the same step-up as the reset-link route.
 */
export function CreateUserDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  /** Fired once the account exists, so the list can refetch. */
  onCreated: () => void;
}) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [result, setResult] = useState<AdminCreateUserResponse | null>(null);
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");

  // A response landing after the dialog was dismissed is dropped, not stored.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || username.trim() === "" || email.trim() === "" || password === "") return;
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const res = await api.createAdminUser({
        username: username.trim(),
        email: email.trim(),
        role,
        password,
      });
      // The account exists even if the dialog was dismissed: refresh the list.
      onCreated();
      if (!alive.current) return;
      setPassword("");
      setResult(res);
    } catch (err) {
      if (!alive.current) return;
      setFields(fieldErrors(err) ?? {});
      setError(
        errorMessage(
          err,
          "Could not create the user. If the account was created and then deactivated, its username and email stay taken until you delete it from the users list.",
        ),
      );
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function copyLink() {
    if (!result?.reset_url) return;
    try {
      await navigator.clipboard.writeText(result.reset_url);
      if (alive.current) setCopy("copied");
    } catch {
      if (alive.current) setCopy("failed");
    }
  }

  if (result) {
    return (
      <Modal title="User created" onClose={onClose} hideClose={!!result.reset_url}>
        <div className="flex flex-col gap-4">
          {result.link_emailed || !result.reset_url ? (
            <Alert variant="success">
              <strong>{result.user.username}</strong> was created. A link to choose their password
              was emailed to them; it works once and expires at {formatDateTime(result.expires_at)}.
            </Alert>
          ) : (
            <>
              <Alert variant="warning">
                <strong>{result.user.username}</strong> was created without a password. Anyone with
                this link can set it. Send it to them over a channel you trust. It works once and
                expires at {formatDateTime(result.expires_at)}.
              </Alert>
              <Input
                label="Set-password link"
                readOnly
                value={result.reset_url}
                autoComplete="off"
                spellCheck={false}
                onFocus={(e) => e.currentTarget.select()}
              />
              <div className="flex items-center gap-2">
                <Button type="button" onClick={() => void copyLink()}>
                  {copy === "copied" ? "Copied" : "Copy link"}
                </Button>
              </div>
              {copy === "failed" ? (
                <p className="text-sm text-danger">
                  Could not copy automatically. Select the link above and copy it by hand.
                </p>
              ) : null}
              <p className="text-[12px] leading-relaxed text-fg-muted">
                This is the only time the link is shown. Closing this window discards it.
              </p>
            </>
          )}
          <div>
            <Button type="button" variant="secondary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Create user" onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
        <p className="text-[13px] leading-relaxed text-fg-muted">
          The new user chooses their own password from a one-time link. The email address is marked
          verified, and the action is recorded in the audit log.
        </p>
        <Input
          label="Username"
          autoComplete="off"
          value={username}
          error={fields.username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <Input
          label="Email"
          type="email"
          autoComplete="off"
          value={email}
          error={fields.email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <SegmentedControl<UserRole>
          label="Role"
          options={ROLES}
          value={role}
          onChange={setRole}
          disabled={busy}
        />
        <Input
          label="Your password"
          type="password"
          autoComplete="current-password"
          value={password}
          error={fields.password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error ? <Alert>{error}</Alert> : null}
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={busy || username.trim() === "" || email.trim() === "" || password === ""}>
            {busy ? "Creating…" : "Create user"}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
