"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, errorMessage } from "@/lib/api";
import type { AdminPasswordResetLink, AdminUser } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

/**
 * PasswordResetLinkCard — the operator answer to "I am locked out and this
 * instance cannot send mail". Core mints the ordinary single-use reset token and
 * returns the link ONCE (Cache-Control: no-store); mail is what normally carries
 * it, so here the admin carries it instead.
 *
 * The link is a credential for the account, so it lives in one place only: this
 * dialog's state. It is never put in storage, the URL, a toast or a log, and it
 * is gone the moment the dialog unmounts. Closing the dialog is therefore a
 * real "forget it" — minting another link (which cancels this one) is the way
 * back, not a stored copy.
 *
 * Like the second-factor removal beside it, it re-asks for the CALLER's own
 * password. Core only issues links for active accounts with role `user` (the
 * owner and staff recover through the host), so the card is not rendered for
 * the others rather than offering a control that 403s.
 */
export function PasswordResetLinkCard({ user }: { user: AdminUser }) {
  const [open, setOpen] = useState(false);

  if (user.role !== "user" || user.is_owner === true) return null;

  return (
    <div className="rounded-2xl border border-border p-4">
      <h3 className="text-[13.5px] font-semibold text-fg">Password reset link</h3>
      <p className="mt-1.5 text-[12px] leading-relaxed text-fg-muted">
        When this instance cannot send mail,{" "}
        <span className="font-medium text-fg">{user.username}</span> cannot request a reset link
        themselves. Create one here and send it to them yourself. It works once, signs them out
        everywhere when they use it, and the action is recorded in the audit log.
      </p>
      <div className="mt-3">
        <Button
          variant="tonal"
          size="sm"
          aria-label={`Create password reset link for ${user.username}`}
          onClick={() => setOpen(true)}
        >
          Create password reset link
        </Button>
      </div>
      {open ? <ResetLinkDialog user={user} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function ResetLinkDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<AdminPasswordResetLink | null>(null);
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");

  // A response that lands after the dialog was dismissed must be dropped, not
  // stored: nobody is looking, and a link nobody saw is just a live credential
  // sitting in memory. (The server-side token still exists; minting another
  // cancels it.)
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || password === "") return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.createAdminUserPasswordResetLink(user.id, { password });
      if (!alive.current) return;
      setPassword("");
      setLink(res);
    } catch (err) {
      if (!alive.current) return;
      setError(errorMessage(err, "Could not create a reset link. Nothing was issued."));
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.reset_url);
      if (alive.current) setCopy("copied");
    } catch {
      // Clipboard can be unavailable (permissions, insecure context); the field
      // stays selectable for a manual copy.
      if (alive.current) setCopy("failed");
    }
  }

  if (link) {
    return (
      <Modal title="Password reset link" onClose={onClose} hideClose>
        <div className="flex flex-col gap-4">
          <Alert variant="warning">
            Anyone with this link can set a new password for this account. Send it to the user over
            a channel you trust. It works once and expires at {formatDateTime(link.expires_at)}.
            Creating another link cancels this one.
          </Alert>
          <Input
            label="Reset link"
            readOnly
            value={link.reset_url}
            autoComplete="off"
            spellCheck={false}
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => void copyLink()}>
              {copy === "copied" ? "Copied" : "Copy link"}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Done
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
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Create password reset link" onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
        <p className="text-[13px] leading-relaxed text-fg-muted">
          Confirm it is you. Enter your own password to create a one-time link that lets{" "}
          <strong className="font-semibold text-fg">{user.username}</strong> choose a new password.
        </p>
        <Input
          label="Your password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error ? <Alert>{error}</Alert> : null}
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={busy || password === ""}>
            {busy ? "Creating…" : "Create link"}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
