// The outbound-mail form's model, kept out of the component so the rules that
// decide what reaches the server can be read and tested on their own. The one
// that matters most is the SECRET rule: a write-only credential the admin did
// not touch must be OMITTED from the PUT, never echoed back as its mask, or
// every unrelated save re-writes a password the panel never had.

import type {
  MailConfigDocument,
  MailConfigInput,
  MailConfigState,
  MailSMTPEncryption,
  MailTransport,
  MailgunRegion,
} from "@/lib/api";

/** The dotted key of each transport's one credential — also its 422 field path. */
export const SECRET_FIELD = {
  smtp: "smtp.password",
  mailgun: "mailgun.api_key",
  resend: "resend.api_key",
  brevo: "brevo.api_key",
  postmark: "postmark.server_token",
} as const satisfies Record<MailTransport, string>;

export type SecretField = (typeof SECRET_FIELD)[MailTransport];

export type MailDraft = {
  transport: MailTransport;
  from_name: string;
  from_address: string;
  reply_to: string;
  // Every transport's block is held at once, so switching away and back loses
  // nothing the admin typed. Only the block matching `transport` is ever sent.
  smtp: { host: string; port: string; encryption: MailSMTPEncryption; username: string };
  mailgun: { domain: string; region: MailgunRegion };
  postmark: { message_stream: string };
  /**
   * Pending credentials by dotted key. `undefined` = untouched (omit from the
   * PUT), `""` = clear, anything else = replace. The three states are values of
   * one field precisely so "untouched" cannot be confused with "empty".
   */
  secrets: Partial<Record<SecretField, string>>;
};

export const TRANSPORT_OPTIONS: ReadonlyArray<{
  value: MailTransport;
  label: string;
  hint: string;
}> = [
  {
    value: "smtp",
    label: "SMTP relay",
    hint: "Any mail server with a host, port and login. Some hosting providers block the ports it needs.",
  },
  {
    value: "resend",
    label: "Resend",
    hint: "Needs one API key. Works over HTTPS, so blocked SMTP ports do not matter.",
  },
  {
    value: "mailgun",
    label: "Mailgun",
    hint: "Needs an API key and your sending domain. Choose the region your domain was created in.",
  },
  { value: "brevo", label: "Brevo", hint: "Needs one API key. Works over HTTPS." },
  { value: "postmark", label: "Postmark", hint: "Needs a server token. Works over HTTPS." },
];

/** How the status line names the route in force. */
export const TRANSPORT_NAME: Record<MailTransport, string> = {
  smtp: "an SMTP relay",
  mailgun: "Mailgun",
  resend: "Resend",
  brevo: "Brevo",
  postmark: "Postmark",
};

export const ENCRYPTION_OPTIONS: ReadonlyArray<{
  value: MailSMTPEncryption;
  label: string;
  hint: string;
}> = [
  {
    value: "starttls",
    label: "Encrypted after connecting (STARTTLS)",
    hint: "Usual choice. Port 587, or 2525 if your host blocks 587.",
  },
  {
    value: "tls",
    label: "Encrypted from the start (SSL/TLS)",
    hint: "Port 465.",
  },
  {
    value: "none",
    label: "Not encrypted",
    hint: "Only safe for a relay running on this same machine.",
  },
];

/**
 * SMTP presets. PRESENTATION ONLY — a preset writes host/port/encryption into
 * the form and is never part of the PUT, so the server can never be told "this
 * is a Resend relay" as a fact it would have to keep true.
 *
 * Every entry's port↔encryption pairing is confirmed from the vendor's own
 * documentation; a provider whose doc could not be read is absent rather than
 * guessed, because a preset that is wrong is worse than no preset — it looks
 * authoritative while producing a relay that cannot connect.
 */
export const SMTP_PRESETS: ReadonlyArray<{
  id: string;
  label: string;
  host: string;
  port: number;
  encryption: MailSMTPEncryption;
}> = [
  {
    // developers.smtp2go.com/docs/smtp-relay: "TLS (or no encryption):
    // available on 25, 2525, 8025, 587 and 80." 2525 is the port the vendor
    // recommends because it survives hosts that block submission ports.
    id: "smtp2go",
    label: "SMTP2GO",
    host: "mail.smtp2go.com",
    port: 2525,
    encryption: "starttls",
  },
  {
    // resend.com/docs/send-with-smtp: "STARTTLS ports (25, 587, 2587):
    // Explicit SSL/TLS". 2587 for the same port-blocking reason.
    id: "resend",
    label: "Resend (SMTP)",
    host: "smtp.resend.com",
    port: 2587,
    encryption: "starttls",
  },
];

/** The conventional port for an encryption mode, offered but never forced. */
export function suggestedPort(encryption: MailSMTPEncryption): number {
  switch (encryption) {
    case "tls":
      return 465;
    case "none":
      return 25;
    default:
      return 587;
  }
}

function emptyDraft(): MailDraft {
  return {
    transport: "smtp",
    from_name: "",
    from_address: "",
    reply_to: "",
    smtp: { host: "", port: "587", encryption: "starttls", username: "" },
    mailgun: { domain: "", region: "us" },
    postmark: { message_stream: "outbound" },
    secrets: {},
  };
}

/** Seed the working copy from the server document (or from nothing). */
export function draftFromState(state: MailConfigState): MailDraft {
  const base = emptyDraft();
  const doc: MailConfigDocument | null = state.config;
  if (!doc) return base;
  return {
    ...base,
    transport: doc.transport,
    from_name: doc.from_name ?? "",
    from_address: doc.from_address ?? "",
    reply_to: doc.reply_to ?? "",
    smtp: doc.smtp
      ? {
          host: doc.smtp.host,
          port: String(doc.smtp.port),
          encryption: doc.smtp.encryption,
          username: doc.smtp.username,
        }
      : base.smtp,
    mailgun: doc.mailgun
      ? { domain: doc.mailgun.domain, region: doc.mailgun.region }
      : base.mailgun,
    postmark: doc.postmark
      ? { message_stream: doc.postmark.message_stream }
      : base.postmark,
  };
}

/** Whether the server is holding a credential for the transport being edited. */
export function storedSecret(state: MailConfigState, transport: MailTransport): boolean {
  const doc = state.config;
  if (!doc || doc.transport !== transport) return false;
  // An undecryptable credential is stored but unusable, and showing it as
  // "saved" would invite the admin to leave a dead secret in place.
  if (state.secret_status === "undecryptable") return false;
  switch (transport) {
    case "smtp":
      return doc.smtp?.password_set === true;
    case "mailgun":
      return doc.mailgun?.api_key_set === true;
    case "resend":
      return doc.resend?.api_key_set === true;
    case "brevo":
      return doc.brevo?.api_key_set === true;
    case "postmark":
      return doc.postmark?.server_token_set === true;
  }
}

/**
 * Whether the SMTP host has been pointed at a DIFFERENT server than the one the
 * stored password was entered for.
 *
 * The server refuses to carry a kept secret across that change — a credential
 * belongs to the host it was issued for, and silently re-offering it to a new
 * one would hand a relay password to whoever the admin just typed. So the panel
 * gets ahead of the 422: the password field returns to its empty state and the
 * PUT carries `smtp.password` explicitly (typed, or "" for an anonymous relay).
 * Username, port and encryption do not trigger it; neither does a Mailgun
 * domain or region, whose host is pinned by the vendor.
 */
export function smtpHostRepointed(draft: MailDraft, state: MailConfigState): boolean {
  if (draft.transport !== "smtp") return false;
  if (!storedSecret(state, "smtp")) return false;
  const savedHost = state.config?.smtp?.host ?? "";
  return draft.smtp.host.trim() !== savedHost;
}

function portNumber(raw: string): number {
  const n = Number.parseInt(raw.trim(), 10);
  // 0 rather than a guess: an empty or unparseable port is a problem the
  // server's own validator should name, on the field, in its own words.
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * The PUT body. Only the block matching `transport` travels, and a secret only
 * travels when the admin touched it — or when the SMTP host moved, which makes
 * the stored one unusable.
 */
export function buildMailConfigInput(
  draft: MailDraft,
  state: MailConfigState,
): MailConfigInput {
  const input: MailConfigInput = {
    transport: draft.transport,
    from_address: draft.from_address.trim(),
    from_name: draft.from_name,
    reply_to: draft.reply_to.trim(),
  };
  const pending = (field: SecretField): string | undefined => draft.secrets[field];

  switch (draft.transport) {
    case "smtp": {
      const password = pending("smtp.password");
      const repointed = smtpHostRepointed(draft, state);
      input.smtp = {
        host: draft.smtp.host.trim(),
        port: portNumber(draft.smtp.port),
        encryption: draft.smtp.encryption,
        username: draft.smtp.username.trim(),
        ...(password !== undefined
          ? { password }
          : repointed
            ? { password: "" }
            : {}),
      };
      break;
    }
    case "mailgun": {
      const key = pending("mailgun.api_key");
      input.mailgun = {
        domain: draft.mailgun.domain.trim(),
        region: draft.mailgun.region,
        ...(key !== undefined ? { api_key: key } : {}),
      };
      break;
    }
    case "resend": {
      const key = pending("resend.api_key");
      input.resend = key !== undefined ? { api_key: key } : {};
      break;
    }
    case "brevo": {
      const key = pending("brevo.api_key");
      input.brevo = key !== undefined ? { api_key: key } : {};
      break;
    }
    case "postmark": {
      const token = pending("postmark.server_token");
      input.postmark = {
        message_stream: draft.postmark.message_stream.trim(),
        ...(token !== undefined ? { server_token: token } : {}),
      };
      break;
    }
  }
  return input;
}

/** Any edited field, or any credential the admin has started changing. */
export function isDirty(draft: MailDraft, baseline: MailDraft): boolean {
  if (Object.values(draft.secrets).some((v) => v !== undefined)) return true;
  return (
    draft.transport !== baseline.transport ||
    draft.from_name !== baseline.from_name ||
    draft.from_address !== baseline.from_address ||
    draft.reply_to !== baseline.reply_to ||
    draft.smtp.host !== baseline.smtp.host ||
    draft.smtp.port !== baseline.smtp.port ||
    draft.smtp.encryption !== baseline.smtp.encryption ||
    draft.smtp.username !== baseline.smtp.username ||
    draft.mailgun.domain !== baseline.mailgun.domain ||
    draft.mailgun.region !== baseline.mailgun.region ||
    draft.postmark.message_stream !== baseline.postmark.message_stream
  );
}

/**
 * Every field this form renders, in DOM order, per transport. A 422 moves focus
 * to the FIRST offending input, and "first" has to mean first on screen — an
 * object's key order is not a layout.
 */
export const FIELD_ORDER: Record<MailTransport, readonly string[]> = {
  smtp: [
    "smtp.host",
    "smtp.port",
    "smtp.encryption",
    "smtp.username",
    "smtp.password",
    "from_name",
    "from_address",
    "reply_to",
  ],
  mailgun: [
    "mailgun.domain",
    "mailgun.region",
    "mailgun.api_key",
    "from_name",
    "from_address",
    "reply_to",
  ],
  resend: ["resend.api_key", "from_name", "from_address", "reply_to"],
  brevo: ["brevo.api_key", "from_name", "from_address", "reply_to"],
  postmark: [
    "postmark.message_stream",
    "postmark.server_token",
    "from_name",
    "from_address",
    "reply_to",
  ],
};

/** The DOM id this form gives a dotted field key, so a 422 can reach it. */
export function fieldElementId(key: string): string {
  return `mail-field-${key.replace(/\./g, "-")}`;
}
