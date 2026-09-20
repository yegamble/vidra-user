"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { RoleGate } from "@/components/RoleGate";
import { MailTestCard } from "@/components/admin/MailTestCard";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SecretInput } from "@/components/ui/SecretInput";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { TextLink } from "@/components/ui/TextLink";
import { ApiError, api, errorMessage, fieldErrors } from "@/lib/api";
import type {
  MailConfigState,
  MailSMTPEncryption,
  MailTransport,
  MailgunRegion,
} from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { refreshInstanceFeatures } from "@/lib/instance-features";
import {
  ENCRYPTION_OPTIONS,
  FIELD_ORDER,
  SECRET_FIELD,
  SMTP_PRESETS,
  TRANSPORT_NAME,
  TRANSPORT_OPTIONS,
  buildMailConfigInput,
  draftFromState,
  fieldElementId,
  isDirty,
  smtpHostRepointed,
  storedSecret,
  suggestedPort,
  type MailDraft,
  type SecretField,
} from "@/lib/mail-config";

/**
 * The instance's outbound-mail page. Bespoke rather than registry-driven for
 * the reason PAGE_SECTIONS.email records: the instance-settings registry echoes
 * every value it stores, so it cannot hold a credential.
 *
 * What lives here is the delivery path — how mail leaves this server, and
 * whether it does. How mail LOOKS (subject prefix, signature) stays on
 * Customization → Email, which is why this page links there instead of
 * duplicating those two fields.
 */
export function AdminEmailConfigView() {
  return (
    <RoleGate minRole="admin" action="configure outbound email">
      <EmailConfigPanel />
    </RoleGate>
  );
}

type LoadState = "loading" | "ready" | "unsupported" | "error";
type SaveResult =
  | { kind: "saved" }
  | { kind: "reset" }
  | { kind: "error"; message: string }
  | null;

const CUSTOM_PRESET = "custom";

/** What each transport calls its one credential. */
const SECRET_LABEL: Record<MailTransport, string> = {
  smtp: "Password",
  mailgun: "API key",
  resend: "API key",
  brevo: "API key",
  postmark: "Server token",
};

// Exported for component tests; production always enters through the role gate
// (the same pattern ConfigForm and InfrastructurePanel use).
export function EmailConfigPanel() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [state, setState] = useState<MailConfigState | null>(null);
  const [draft, setDraft] = useState<MailDraft | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<SaveResult>(null);
  const [saving, setSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // The port is only auto-filled until the admin types one. After that a
  // suggestion is a sentence, never an overwrite: silently replacing a port
  // someone chose is how a working 2525 relay turns back into a blocked 587.
  const [portTouched, setPortTouched] = useState(false);
  const [preset, setPreset] = useState<string>(CUSTOM_PRESET);
  // Whether the SMTP host has been pointed at a different server, decided when
  // the field is LEFT rather than on every character: mid-word the host is
  // always "different", so a per-keystroke rule flips the password field in and
  // out under the caret and announces the change on each backspace.
  const [hostRepointed, setHostRepointed] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getMailConfig(controller.signal)
      .then((data) => {
        setState(data);
        setDraft(draftFromState(data));
        // A stored port was chosen by someone, so it is already "touched": an
        // encryption toggle must never rewrite a working 2525 relay back to
        // the 587 its operator deliberately moved off.
        setPortTouched(Boolean(data.config?.smtp));
        setPreset(CUSTOM_PRESET);
        setHostRepointed(false);
        setLoadState("ready");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        // 501: this build does not carry the mail-config service. That is a
        // deployment fact, not a failure — say so instead of offering Retry.
        setLoadState(err instanceof ApiError && err.status === 501 ? "unsupported" : "error");
      });
    return () => controller.abort();
  }, [reloadKey]);

  const baseline = useMemo(() => (state ? draftFromState(state) : null), [state]);

  const patch = useCallback((next: Partial<MailDraft>) => {
    setDraft((current) => (current ? { ...current, ...next } : current));
  }, []);

  const setSecret = useCallback((field: SecretField, value: string | undefined) => {
    setDraft((current) =>
      current ? { ...current, secrets: { ...current.secrets, [field]: value } } : current,
    );
  }, []);

  const save = useCallback(async () => {
    // aria-disabled rather than disabled (a browser blurs a focused element the
    // moment it is disabled, and this button holds focus the instant it stops
    // being dirty), so the "nothing to save" and "already saving" refusals are
    // enforced here instead of by the DOM.
    if (inFlight.current || !draft || !state) return;
    if (!isDirty(draft, draftFromState(state))) return;
    // Enter submits without blurring, so settle the repoint question here too:
    // buildMailConfigInput decides what to send from the draft either way, and
    // this keeps what is on screen agreeing with what travelled.
    setHostRepointed(smtpHostRepointed(draft, state));
    inFlight.current = true;
    setSaving(true);
    setErrors({});
    setResult(null);
    try {
      const saved = await api.updateMailConfig(buildMailConfigInput(draft, state));
      setState(saved);
      setDraft(draftFromState(saved));
      setPortTouched(Boolean(saved.config?.smtp));
      setPreset(CUSTOM_PRESET);
      setHostRepointed(false);
      setResult({ kind: "saved" });
      // The public capability snapshot carries features.mail, which gates three
      // settings rows and the password-reset affordance. Re-prime it here so
      // the rest of the app stops claiming mail is unavailable.
      refreshInstanceFeatures();
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        const fields = fieldErrors(err);
        if (fields) {
          setErrors(fields);
          // A key this form does not render has no field to sit under, and a
          // 422 nobody can see is a save that fails for no stated reason — so
          // it falls through to the form-level message verbatim.
          const orphans = Object.entries(fields)
            .filter(([key]) => !FIELD_ORDER[draft.transport].includes(key))
            .map(([key, message]) => `${key}: ${message}`);
          setResult({
            kind: "error",
            message: ["Some settings need fixing before this can be saved.", ...orphans].join(" "),
          });
          focusFirstError(fields, draft.transport);
          return;
        }
      }
      setResult({
        kind: "error",
        message: errorMessage(err, "Could not reach the server. Nothing was saved.", {
          mail_secrets_key_missing:
            "This server has no key to encrypt the credential with, so it was not saved. Set MFA_KEY_KEK in the server environment and restart.",
          "400": "The server rejected this configuration as malformed. Nothing was saved.",
          // The app-wide network copy ("check your connection") is right for a
          // read; for a write the operator's first question is whether half of
          // it landed, so this one answers that instead.
          network_error: "Could not reach the server. Nothing was saved.",
        }),
      });
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }, [draft, state]);

  const discard = useCallback(async () => {
    setDiscarding(true);
    setResult(null);
    try {
      await api.resetMailConfig();
      setConfirmDiscard(false);
      setResult({ kind: "reset" });
      setErrors({});
      setReloadKey((n) => n + 1);
      refreshInstanceFeatures();
    } catch (err) {
      setConfirmDiscard(false);
      setResult({
        kind: "error",
        message: errorMessage(err, "Could not reach the server. Nothing was changed."),
      });
    } finally {
      setDiscarding(false);
    }
  }, []);

  if (loadState === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Spinner label="Loading mail configuration" />
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <ErrorState
        message="Could not load the mail configuration."
        onRetry={() => {
          setLoadState("loading");
          setReloadKey((n) => n + 1);
        }}
      />
    );
  }

  if (loadState === "unsupported" || !state || !draft || !baseline) {
    return (
      <div className="flex max-w-3xl flex-col gap-8">
        <Alert variant="warning">
          This server build does not carry the outbound-mail configuration service, so mail can
          only be set up in the server environment. Upgrade the server to configure it here.
        </Alert>
        <MailTestCard />
      </div>
    );
  }

  // A narrowed alias: TypeScript does not carry the null check above into the
  // function declarations below, and `draft!` in six places reads as six
  // separate assumptions rather than one.
  const current: MailDraft = draft;
  const transport = draft.transport;
  const secretField = SECRET_FIELD[transport];
  const secretsBlocked = state.secrets_available === false;
  const repointed = hostRepointed;
  const secretStored = storedSecret(state, transport) && !(transport === "smtp" && repointed);
  const dirty = isDirty(draft, baseline);
  const suggested = suggestedPort(draft.smtp.encryption);
  const portHint =
    portTouched && draft.smtp.port.trim() !== String(suggested)
      ? `Port ${suggested} is the usual port for this setting.`
      : undefined;

  const secretDisabledProps = secretsBlocked
    ? { disabled: true, disabledReason: "No credential key on this server." }
    : {};

  function setPort(value: string) {
    setPortTouched(true);
    patch({ smtp: { ...current.smtp, port: value } });
  }

  function setEncryption(value: MailSMTPEncryption) {
    const next = { ...current.smtp, encryption: value };
    if (!portTouched) next.port = String(suggestedPort(value));
    patch({ smtp: next });
  }

  function setHost(value: string) {
    // A preset describes a configuration; the moment the host stops matching
    // it, the preset would be claiming something that is no longer true.
    setPreset(CUSTOM_PRESET);
    patch({ smtp: { ...current.smtp, host: value } });
  }

  function applyPreset(id: string) {
    setPreset(id);
    const entry = SMTP_PRESETS.find((p) => p.id === id);
    if (!entry) return;
    patch({
      smtp: {
        ...current.smtp,
        host: entry.host,
        encryption: entry.encryption,
        port: portTouched ? current.smtp.port : String(entry.port),
      },
    });
  }

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <StatusBlock state={state} />

      {secretsBlocked ? (
        <Alert variant="warning">
          This server has no key to encrypt credentials with, so passwords and API keys cannot be
          saved. An SMTP relay that needs no password still works. Set MFA_KEY_KEK in the server
          environment and restart to store a credential.
        </Alert>
      ) : null}

      <form
        className="flex flex-col gap-8"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Card className="flex flex-col gap-4">
          <div>
            <h2 className="text-[15px] font-bold tracking-tight">How mail is sent</h2>
            <p className="mt-1 text-sm text-fg-muted">
              The route this instance uses to hand a message to the internet.
            </p>
          </div>

          <Select
            label="How this instance sends mail"
            value={transport}
            hint={TRANSPORT_OPTIONS.find((o) => o.value === transport)?.hint}
            onChange={(e) => patch({ transport: e.target.value as MailTransport })}
          >
            {TRANSPORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>

          {transport === "smtp" ? (
            <div className="flex flex-col gap-4">
              <Select
                label="Fill in settings for"
                value={preset}
                hint="Presets only fill the fields in — they are not saved as a choice."
                onChange={(e) => applyPreset(e.target.value)}
              >
                <option value={CUSTOM_PRESET}>Custom / other</option>
                {SMTP_PRESETS.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </Select>
              <div className="flex flex-col gap-1">
                <Input
                  id={fieldElementId("smtp.host")}
                  label="Server address"
                  inputMode="url"
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="smtp.example.com"
                  hint="The hostname your provider gave you."
                  error={errors["smtp.host"]}
                  value={draft.smtp.host}
                  onChange={(e) => setHost(e.target.value)}
                  onBlur={() => setHostRepointed(smtpHostRepointed(current, state))}
                />
                {/* The consequence, where the hands are. Moving the password
                    field two rows below the caret is invisible to a screen
                    reader; this says it, once, when the field is left. */}
                {repointed ? (
                  <p role="status" className="text-xs text-fg-muted">
                    The saved password must be entered again for a different server.
                  </p>
                ) : null}
              </div>
              <Input
                id={fieldElementId("smtp.port")}
                label="Port"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                className="max-w-[10rem]"
                hint={portHint}
                error={errors["smtp.port"]}
                value={draft.smtp.port}
                onChange={(e) => setPort(e.target.value)}
              />
              <Select
                id={fieldElementId("smtp.encryption")}
                label="Encryption"
                hint={ENCRYPTION_OPTIONS.find((o) => o.value === draft.smtp.encryption)?.hint}
                error={errors["smtp.encryption"]}
                value={draft.smtp.encryption}
                onChange={(e) => setEncryption(e.target.value as MailSMTPEncryption)}
              >
                {ENCRYPTION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <Input
                id={fieldElementId("smtp.username")}
                label="Username"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                hint="Leave empty for a relay that accepts mail without a login."
                error={errors["smtp.username"]}
                value={draft.smtp.username}
                onChange={(e) => patch({ smtp: { ...draft.smtp, username: e.target.value } })}
              />
              <SecretInput
                id={fieldElementId("smtp.password")}
                label={SECRET_LABEL.smtp}
                isSet={secretStored}
                allowClear
                value={draft.secrets["smtp.password"]}
                onChange={(next) => setSecret("smtp.password", next)}
                error={errors["smtp.password"]}
                hint={
                  repointed
                    ? "Changing the server address means entering the password again. Leave empty if this relay needs no password."
                    : "Leave empty if your relay needs no password."
                }
                {...secretDisabledProps}
              />
            </div>
          ) : null}

          {transport === "mailgun" ? (
            <div className="flex flex-col gap-4">
              <Input
                id={fieldElementId("mailgun.domain")}
                label="Sending domain"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="mail.example.com"
                hint="The domain you added in Mailgun, e.g. mail.example.com."
                error={errors["mailgun.domain"]}
                value={draft.mailgun.domain}
                onChange={(e) => patch({ mailgun: { ...draft.mailgun, domain: e.target.value } })}
              />
              {/* SegmentedControl takes no id, so the group gets a focusable
                  wrapper: without one, focusFirstError falls THROUGH a 422 on
                  this key and lands on a later field, leaving the message on
                  screen wired to nothing. */}
              <div
                id={fieldElementId("mailgun.region")}
                tabIndex={-1}
                // No role of its own: SegmentedControl already renders the
                // labelled group, and nesting a second one would announce two.
                // This wrapper exists to be FOCUSABLE, so a 422 on the key has
                // somewhere to land, and to carry the problem as its
                // description — `aria-invalid` is not supported on a group and
                // would be decoration.
                aria-describedby={
                  errors["mailgun.region"] ? "mail-mailgun-region-error" : undefined
                }
                className="flex flex-col gap-1 focus:outline-none"
              >
                <span id="mail-mailgun-region-label" className="text-sm font-medium text-fg">
                  Mailgun region
                </span>
                <SegmentedControl<MailgunRegion>
                  labelledBy="mail-mailgun-region-label"
                  options={[
                    { value: "us", label: "United States" },
                    { value: "eu", label: "Europe" },
                  ]}
                  value={draft.mailgun.region}
                  onChange={(region) => patch({ mailgun: { ...draft.mailgun, region } })}
                />
                <p id="mail-mailgun-region-hint" className="text-xs text-fg-muted">
                  Must match where the domain was created — the wrong one looks like a missing
                  domain.
                </p>
                {errors["mailgun.region"] ? (
                  <p id="mail-mailgun-region-error" className="text-xs text-danger">
                    {errors["mailgun.region"]}
                  </p>
                ) : null}
              </div>
              <SecretInput
                id={fieldElementId("mailgun.api_key")}
                label={SECRET_LABEL.mailgun}
                isSet={secretStored}
                value={draft.secrets["mailgun.api_key"]}
                onChange={(next) => setSecret("mailgun.api_key", next)}
                error={errors["mailgun.api_key"]}
                {...secretDisabledProps}
              />
            </div>
          ) : null}

          {transport === "resend" || transport === "brevo" ? (
            <SecretInput
              id={fieldElementId(secretField)}
              label={SECRET_LABEL[transport]}
              isSet={secretStored}
              value={draft.secrets[secretField]}
              onChange={(next) => setSecret(secretField, next)}
              error={errors[secretField]}
              {...secretDisabledProps}
            />
          ) : null}

          {transport === "postmark" ? (
            <div className="flex flex-col gap-4">
              <Input
                id={fieldElementId("postmark.message_stream")}
                label="Message stream"
                autoComplete="off"
                spellCheck={false}
                hint="Leave as outbound unless Postmark told you otherwise."
                error={errors["postmark.message_stream"]}
                value={draft.postmark.message_stream}
                onChange={(e) =>
                  patch({ postmark: { ...draft.postmark, message_stream: e.target.value } })
                }
              />
              <SecretInput
                id={fieldElementId("postmark.server_token")}
                label={SECRET_LABEL.postmark}
                isSet={secretStored}
                value={draft.secrets["postmark.server_token"]}
                onChange={(next) => setSecret("postmark.server_token", next)}
                error={errors["postmark.server_token"]}
                {...secretDisabledProps}
              />
            </div>
          ) : null}
        </Card>

        <Card className="flex flex-col gap-4">
          <div>
            <h2 className="text-[15px] font-bold tracking-tight">Who mail comes from</h2>
            <p className="mt-1 text-sm text-fg-muted">
              The name and address every message from this instance carries.
            </p>
          </div>
          <Input
            id={fieldElementId("from_name")}
            label="Sender name"
            autoComplete="off"
            hint="Shown as the sender, e.g. your instance name."
            error={errors.from_name}
            value={draft.from_name}
            onChange={(e) => patch({ from_name: e.target.value })}
          />
          <Input
            id={fieldElementId("from_address")}
            label="Sender address"
            type="email"
            inputMode="email"
            autoComplete="off"
            spellCheck={false}
            placeholder="no-reply@example.org"
            hint="Must be an address your provider is allowed to send from. Publish the SPF and DKIM records your provider gives you, or this mail lands in spam."
            error={errors.from_address}
            value={draft.from_address}
            onChange={(e) => patch({ from_address: e.target.value })}
          />
          <Input
            id={fieldElementId("reply_to")}
            label="Reply-to address (optional)"
            type="email"
            inputMode="email"
            autoComplete="off"
            spellCheck={false}
            hint="Where replies go, when that is not the sender address."
            error={errors.reply_to}
            value={draft.reply_to}
            onChange={(e) => patch({ reply_to: e.target.value })}
          />
        </Card>

        {/* Outside the sticky row below: an Alert that grew INSIDE the bar
            would make it taller at the exact moment a 422 moved focus to a
            field, and a field scrolled to the viewport floor would land under
            the enlarged bar (WCAG 2.4.11). */}
        {result?.kind === "saved" ? (
          <Alert variant="success">
            Mail settings saved. Send a test message below to confirm they work.
          </Alert>
        ) : null}
        {result?.kind === "reset" ? (
          <Alert variant="success">The stored configuration was removed.</Alert>
        ) : null}
        {result?.kind === "error" ? <Alert variant="danger">{result.message}</Alert> : null}

        {/* The house save row, copied from the instance-settings form rather
            than invented a second time. In-flow below sm so it never fights the
            bottom tab bar; opaque bg-canvas so content cannot bleed through. */}
        <div className="z-10 flex flex-wrap items-center gap-3 border-t border-border-subtle bg-canvas py-3 sm:sticky sm:bottom-0">
          {/* aria-disabled, never disabled: a browser blurs a focused element
              the moment it is disabled, so the keyboard user who just pressed
              Save would be dropped to <body> for the length of the request.
              The dimming has to be asked for, though — an unstyled aria-disabled
              primary looks live, and a primary that does nothing on click reads
              as a broken page. */}
          <Button
            type="submit"
            aria-disabled={!dirty || saving || undefined}
            className="aria-disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save mail settings"}
          </Button>
          {/* Shown whenever a document is STORED, which is `source ===
              "database"` in every case but one: the contract says `config` may
              be non-null while the source reads `dev_capture`, and keying this
              on the source would leave a development instance with a saved
              configuration and no way to remove it. */}
          {state.config !== null ? (
            <Button
              type="button"
              variant="danger-outline"
              size="sm"
              onClick={() => setConfirmDiscard(true)}
              aria-disabled={discarding || undefined}
              className="aria-disabled:opacity-60"
            >
              {state.environment.configured
                ? "Use environment configuration"
                : "Remove this configuration"}
            </Button>
          ) : null}
        </div>
      </form>

      {/* The SAVED configuration, never the draft: the test send goes through
          what the server holds, so naming a half-typed host in the failure
          would name a server the probe never tried. */}
      <MailTestCard
        smtpHost={state.config?.smtp?.host}
        smtpPort={state.config?.smtp?.port}
        fromAddress={state.config?.from_address}
      />

      <p className="text-[13px] text-fg-muted">
        The subject prefix and signature applied to every message are presentation settings, and
        live on{" "}
        <TextLink href="/admin/config/customization#config-section-email">
          Customization → Email
        </TextLink>
        .
      </p>

      {confirmDiscard ? (
        <Modal title="Discard this mail configuration?" onClose={() => setConfirmDiscard(false)}>
          <p className="text-sm text-fg-muted">
            {state.environment.configured
              ? "This instance will go back to the mail settings in its server environment. The credential saved here is deleted and cannot be recovered."
              : "This instance will stop sending email entirely. Password resets and verification links will be silently dropped."}
          </p>
          {state.environment.configured && state.environment.from ? (
            <p className="mt-2 text-sm text-fg-muted">
              Mail will then come from {state.environment.from}
              {state.environment.host ? `, through ${state.environment.host}` : ""}.
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmDiscard(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              onClick={() => void discard()}
              aria-disabled={discarding || undefined}
              className="aria-disabled:opacity-60"
            >
              {discarding ? "Discarding…" : "Discard configuration"}
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

/**
 * Move to the first field the server complained about, in the order the page
 * renders them — a 422 that scrolls nowhere leaves a keyboard user to hunt the
 * form for a message they were never told exists.
 */
function focusFirstError(fields: Record<string, string>, transport: MailTransport): void {
  for (const key of FIELD_ORDER[transport]) {
    if (!(key in fields)) continue;
    const el = document.getElementById(fieldElementId(key));
    if (el instanceof HTMLElement) {
      el.focus({ preventScroll: false });
      return;
    }
  }
}

/**
 * The deploy-time facts the GET is allowed to show — never the SMTP login. The
 * From address is here because the contract ships it for exactly one purpose:
 * so an admin can see what a DELETE would revert to BEFORE pressing it.
 */
function environmentDetail(state: MailConfigState): string {
  const { host, port, from } = state.environment;
  if (!host) return "";
  const where = port === undefined ? host : `${host}, port ${port}`;
  return from ? ` (${where}, from ${from})` : ` (${where})`;
}

/**
 * What is sending this instance's mail right now, said before anything the
 * admin can change — a page that opens on a form answers "how do I configure
 * this" while the question that brought them here is "why is nothing arriving".
 */
function StatusBlock({ state }: { state: MailConfigState }) {
  const transport = state.config?.transport;
  return (
    <div className="flex flex-col gap-3">
      {state.source === "none" ? (
        <Alert variant="warning">
          This instance cannot send email. Password resets, address verification and notifications
          are silently dropped. Choose how mail should be sent below.
        </Alert>
      ) : null}

      {state.source === "dev_capture" ? (
        <Alert variant="warning" as="div">
          <p>
            Mail is being captured for development instead of sent. Nobody receives it. Turn off
            DEV_MAIL_CAPTURE_ENABLED before real people use this instance.
          </p>
          {state.config ? (
            <p className="mt-1">
              The configuration below is saved and takes over the moment capture is turned off.
            </p>
          ) : null}
        </Alert>
      ) : null}

      {state.source === "environment" ? (
        <div className="flex flex-col gap-2">
          <div>
            <Badge variant="neutral">From the server environment</Badge>
          </div>
          <p className="text-sm text-fg-muted">
            Mail is configured by this server&rsquo;s environment variables
            {environmentDetail(state)}. Saving below replaces that; you can switch back at any
            time.
          </p>
        </div>
      ) : null}

      {state.source === "database" ? (
        <div className="flex flex-col gap-2">
          <div>
            <Badge variant="success">Configured here</Badge>
          </div>
          <p className="text-sm text-fg-muted">
            This instance sends mail through {transport ? TRANSPORT_NAME[transport] : "a configured provider"}.
            {state.updated_at ? ` Last saved ${relativeTime(state.updated_at)}.` : ""}
          </p>
        </div>
      ) : null}

      {state.secret_status === "undecryptable" ? (
        <Alert variant="danger">
          The saved credential can no longer be read, because the key that encrypted it has
          changed. Mail is failing until you enter it again.
        </Alert>
      ) : null}
    </div>
  );
}
