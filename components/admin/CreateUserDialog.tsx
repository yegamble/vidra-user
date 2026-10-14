"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { useT } from "@/components/I18nProvider";
import { SLOT, withSlot } from "@/components/admin/messageSlot";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { api, errorMessage, fieldErrors } from "@/lib/api";
import type { AdminCreateUserResponse, UserRole } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { PlainMessageKey } from "@/lib/i18n";

const ROLES: readonly { value: UserRole; labelKey: PlainMessageKey }[] = [
  { value: "user", labelKey: "admin.role.user" },
  { value: "moderator", labelKey: "admin.role.moderator" },
  { value: "admin", labelKey: "admin.role.admin" },
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
  const t = useT();
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
        errorMessage(err, t("admin.createUser.error")),
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
      <Modal title={t("admin.createUser.createdTitle")} onClose={onClose} hideClose={!!result.reset_url}>
        <div className="flex flex-col gap-4">
          {result.link_emailed || !result.reset_url ? (
            <Alert variant="success">
              {withSlot(
                t("admin.createUser.emailed", {
                  name: SLOT,
                  expires: formatDateTime(result.expires_at),
                }),
                <strong>{result.user.username}</strong>,
              )}
            </Alert>
          ) : (
            <>
              <Alert variant="warning">
                {withSlot(
                  t("admin.createUser.manual", {
                    name: SLOT,
                    expires: formatDateTime(result.expires_at),
                  }),
                  <strong>{result.user.username}</strong>,
                )}
              </Alert>
              <Input
                label={t("admin.createUser.linkField")}
                readOnly
                value={result.reset_url}
                autoComplete="off"
                spellCheck={false}
                onFocus={(e) => e.currentTarget.select()}
              />
              <div className="flex items-center gap-2">
                <Button type="button" onClick={() => void copyLink()}>
                  {copy === "copied" ? t("admin.link.copied") : t("admin.link.copy")}
                </Button>
              </div>
              {copy === "failed" ? (
                <p className="text-sm text-danger">
                  {t("admin.link.copyFailed")}
                </p>
              ) : null}
              <p className="text-[12px] leading-relaxed text-fg-muted">
                {t("admin.link.shownOnce")}
              </p>
            </>
          )}
          <div>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t("admin.link.done")}
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={t("admin.createUser.title")} onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
        <p className="text-[13px] leading-relaxed text-fg-muted">
          {t("admin.createUser.intro")}
        </p>
        <Input
          label={t("admin.createUser.username")}
          autoComplete="off"
          value={username}
          error={fields.username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <Input
          label={t("admin.createUser.email")}
          type="email"
          autoComplete="off"
          value={email}
          error={fields.email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <SegmentedControl<UserRole>
          label={t("admin.createUser.role")}
          options={ROLES.map((r) => ({ value: r.value, label: t(r.labelKey) }))}
          value={role}
          onChange={setRole}
          disabled={busy}
        />
        <Input
          label={t("admin.createUser.password")}
          type="password"
          autoComplete="current-password"
          value={password}
          error={fields.password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error ? <Alert>{error}</Alert> : null}
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={busy || username.trim() === "" || email.trim() === "" || password === ""}>
            {busy ? t("admin.createUser.busy") : t("admin.createUser.submit")}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
