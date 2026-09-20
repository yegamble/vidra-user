// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendTestMail: vi.fn(),
  getMailConfig: vi.fn(),
  updateMailConfig: vi.fn(),
  resetMailConfig: vi.fn(),
  refreshInstanceFeatures: vi.fn(),
}));

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      sendTestMail: mocks.sendTestMail,
      getMailConfig: mocks.getMailConfig,
      updateMailConfig: mocks.updateMailConfig,
      resetMailConfig: mocks.resetMailConfig,
    },
  };
});

vi.mock("@/lib/instance-features", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/instance-features")>();
  return { ...actual, refreshInstanceFeatures: mocks.refreshInstanceFeatures };
});

import { ApiError } from "@/lib/api";
import type { MailConfigState } from "@/lib/api";

import { EmailConfigPanel } from "./AdminEmailConfigView";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// --- Fixtures ---------------------------------------------------------------

const EMPTY: MailConfigState = {
  source: "none",
  secrets_available: true,
  secret_status: "none",
  environment: { configured: false },
  config: null,
};

function smtpState(over: Partial<MailConfigState> = {}): MailConfigState {
  return {
    source: "database",
    secrets_available: true,
    secret_status: "ok",
    environment: { configured: false },
    updated_at: new Date().toISOString(),
    config: {
      transport: "smtp",
      from_address: "no-reply@example.org",
      from_name: "Example",
      reply_to: "",
      smtp: {
        host: "smtp.example.com",
        port: 587,
        encryption: "starttls",
        username: "postmaster",
        password_set: true,
      },
    },
    ...over,
  };
}

async function mount(state: MailConfigState = EMPTY) {
  mocks.getMailConfig.mockResolvedValue(state);
  mocks.updateMailConfig.mockResolvedValue(state);
  const view = render(<EmailConfigPanel />);
  await screen.findByRole("heading", { name: "How mail is sent" });
  return view;
}

const saveButton = () => screen.getByRole("button", { name: /Save mail settings|Saving/ });
const transportSelect = () => screen.getByLabelText("How this instance sends mail");
const savedBody = () => mocks.updateMailConfig.mock.calls[0]?.[0];

/** Type a server address and leave the field — the repoint rule is blur-time. */
function typeHost(value: string) {
  const host = screen.getByLabelText("Server address");
  fireEvent.change(host, { target: { value } });
  fireEvent.blur(host);
}

async function saveAndWait() {
  fireEvent.click(saveButton());
  await waitFor(() => expect(mocks.updateMailConfig).toHaveBeenCalled());
}

// --- AC1 --------------------------------------------------------------------

describe("headings (AC1)", () => {
  it("uses only h2 section headings, so the layout's h1 is never skipped past", async () => {
    const { container } = await mount();
    // The page <h1> is "Instance configuration", owned by the config layout;
    // this panel contributes the section level and nothing deeper.
    expect(container.querySelectorAll("h1")).toHaveLength(0);
    expect(container.querySelectorAll("h3")).toHaveLength(0);
    expect(container.querySelectorAll("h2").length).toBeGreaterThan(0);
  });
});

// --- AC2 --------------------------------------------------------------------

describe("transport switching (AC2)", () => {
  it("shows only the chosen transport's fields and keeps the others' values", async () => {
    await mount();
    fireEvent.change(screen.getByLabelText("Server address"), {
      target: { value: "relay.example.net" },
    });

    fireEvent.change(transportSelect(), { target: { value: "mailgun" } });
    expect(screen.queryByLabelText("Server address")).toBeNull();
    fireEvent.change(screen.getByLabelText("Sending domain"), {
      target: { value: "mail.example.org" },
    });

    // Back and forth loses nothing: the draft holds every block at once, so an
    // admin comparing two providers does not retype the first one.
    fireEvent.change(transportSelect(), { target: { value: "smtp" } });
    expect((screen.getByLabelText("Server address") as HTMLInputElement).value).toBe(
      "relay.example.net",
    );
    expect(screen.queryByLabelText("Sending domain")).toBeNull();

    fireEvent.change(transportSelect(), { target: { value: "mailgun" } });
    expect((screen.getByLabelText("Sending domain") as HTMLInputElement).value).toBe(
      "mail.example.org",
    );
  });
});

// --- AC3 --------------------------------------------------------------------

describe("the untouched-secret contract (AC3)", () => {
  it("sends no secret key at all when the credential was not touched", async () => {
    await mount(smtpState());
    fireEvent.change(screen.getByLabelText("Sender name"), { target: { value: "Renamed" } });
    await saveAndWait();

    const body = savedBody();
    expect(body.smtp).not.toHaveProperty("password");
    expect(body.from_name).toBe("Renamed");
    // A masked field echoed back would overwrite the stored password with a
    // row of bullets; omission is the only shape that keeps it alive.
    expect(JSON.stringify(body)).not.toContain("•");
  });

  it("sends an empty string when the admin removes the password", async () => {
    await mount(smtpState());
    fireEvent.click(screen.getByRole("button", { name: "Remove Password" }));
    await saveAndWait();
    expect(savedBody().smtp.password).toBe("");
  });

  it("re-asks for the password when the server address is pointed elsewhere", async () => {
    await mount(smtpState());
    // A stored credential belongs to the host it was issued for; carrying it to
    // a different server would hand that password to whoever was just typed in.
    typeHost("relay.elsewhere.net");
    // Said where the hands are, and announced — the password field moving two
    // rows below the caret is invisible to a screen reader.
    expect(
      screen.getByText("The saved password must be entered again for a different server."),
    ).toBeTruthy();
    const field = screen.getByLabelText("Password") as HTMLInputElement;
    expect(field.type).toBe("password");
    expect(field.value).toBe("");
    fireEvent.change(field, { target: { value: "fresh-secret" } });
    await saveAndWait();
    expect(savedBody().smtp.password).toBe("fresh-secret");
  });

  it("sends an empty password for a re-pointed relay the admin leaves blank", async () => {
    await mount(smtpState());
    typeHost("anonymous.example.net");
    await saveAndWait();
    expect(savedBody().smtp).toHaveProperty("password", "");
  });

  it("omits the password again once the original server address is restored", async () => {
    await mount(smtpState());
    typeHost("relay.elsewhere.net");
    typeHost("smtp.example.com");
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(
      screen.queryByText("The saved password must be entered again for a different server."),
    ).toBeNull();
    fireEvent.change(screen.getByLabelText("Sender name"), { target: { value: "Renamed" } });
    await saveAndWait();
    expect(savedBody().smtp).not.toHaveProperty("password");
  });

  it("treats a re-capitalised host as the same server, as the server does", async () => {
    await mount(smtpState());
    // iOS capitalises a bare text input. A panel that called this a different
    // server would clear a password the server then refuses to do without.
    typeHost("SMTP.Example.com");
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(screen.getByRole("button", { name: "Replace Password" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Sender name"), { target: { value: "Renamed" } });
    await saveAndWait();
    expect(savedBody().smtp).not.toHaveProperty("password");
  });

  it("asks the browser not to capitalise or correct a hostname or a login", async () => {
    await mount(smtpState());
    for (const label of ["Server address", "Username"]) {
      const el = screen.getByLabelText(label);
      expect(el.getAttribute("autocapitalize")).toBe("none");
      expect(el.getAttribute("autocorrect")).toBe("off");
    }
    fireEvent.change(transportSelect(), { target: { value: "mailgun" } });
    expect(screen.getByLabelText("Sending domain").getAttribute("autocapitalize")).toBe("none");
  });

  it("leaves a stored key alone when only the Mailgun region moves", async () => {
    await mount(
      smtpState({
        config: {
          transport: "mailgun",
          from_address: "no-reply@example.org",
          from_name: "Example",
          reply_to: "",
          mailgun: { domain: "mail.example.org", region: "us", api_key_set: true },
        },
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Europe" }));
    await saveAndWait();
    // Mailgun's host is pinned by the vendor, so a region change does not
    // re-point the credential the way an SMTP host change does.
    expect(savedBody().mailgun).not.toHaveProperty("api_key");
    expect(savedBody().mailgun.region).toBe("eu");
  });
});

// --- AC4 --------------------------------------------------------------------

describe("field-level 422 (AC4)", () => {
  it("renders the message under its own field and moves focus there", async () => {
    await mount(smtpState());
    mocks.updateMailConfig.mockRejectedValue(
      new ApiError({
        status: 422,
        code: "unprocessable_entity",
        message: "invalid",
        fields: [{ field: "smtp.host", message: "must be a hostname" }],
      }),
    );
    fireEvent.change(screen.getByLabelText("Server address"), { target: { value: "http://x" } });
    await saveAndWait();

    await screen.findByText("must be a hostname");
    const host = screen.getByLabelText("Server address");
    expect(host.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(host);
  });

  it("shows a 422 on a key this form does not render, rather than swallowing it", async () => {
    await mount(smtpState());
    mocks.updateMailConfig.mockRejectedValue(
      new ApiError({
        status: 422,
        code: "unprocessable_entity",
        message: "invalid",
        fields: [{ field: "smtp.tls_policy", message: "not supported here" }],
      }),
    );
    fireEvent.change(screen.getByLabelText("Sender name"), { target: { value: "x" } });
    await saveAndWait();
    const alert = await screen.findByText(/smtp\.tls_policy: not supported here/);
    expect(alert.getAttribute("role")).toBe("alert");
  });

  it("lands focus on the Mailgun region group, which has no input of its own", async () => {
    await mount(
      smtpState({
        config: {
          transport: "mailgun",
          from_address: "no-reply@example.org",
          from_name: "Example",
          reply_to: "",
          mailgun: { domain: "mail.example.org", region: "us", api_key_set: true },
        },
      }),
    );
    mocks.updateMailConfig.mockRejectedValue(
      new ApiError({
        status: 422,
        code: "unprocessable_entity",
        message: "invalid",
        fields: [{ field: "mailgun.region", message: "domain not found in this region" }],
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Europe" }));
    await saveAndWait();
    const message = await screen.findByText("domain not found in this region");
    const wrapper = document.getElementById("mail-field-mailgun-region");
    expect(wrapper).not.toBeNull();
    // Without a focusable wrapper, focusFirstError falls THROUGH this key and
    // lands on a later field while the message sits wired to nothing.
    expect(document.activeElement).toBe(wrapper);
    expect(wrapper?.getAttribute("aria-describedby")).toBe(message.id);
  });

  it("renders a secret's own 422 on the secret field", async () => {
    await mount(smtpState());
    mocks.updateMailConfig.mockRejectedValue(
      new ApiError({
        status: 422,
        code: "unprocessable_entity",
        message: "invalid",
        fields: [{ field: "smtp.password", message: "required for this server" }],
      }),
    );
    fireEvent.change(screen.getByLabelText("Sender name"), { target: { value: "x" } });
    await saveAndWait();
    expect(await screen.findByText("required for this server")).toBeTruthy();
  });
});

// --- AC5 --------------------------------------------------------------------

describe("save outcomes are announced (AC5)", () => {
  it("announces success politely and re-primes the public capability snapshot", async () => {
    await mount(smtpState());
    fireEvent.change(screen.getByLabelText("Sender name"), { target: { value: "Renamed" } });
    await saveAndWait();
    const ok = await screen.findByText(/Mail settings saved/);
    expect(ok.getAttribute("role")).toBe("status");
    expect(mocks.refreshInstanceFeatures).toHaveBeenCalled();
  });

  it("announces a missing key-encryption key as the refusal it is", async () => {
    await mount(smtpState());
    mocks.updateMailConfig.mockRejectedValue(
      new ApiError({
        status: 409,
        code: "mail_secrets_key_missing",
        message: "no kek",
      }),
    );
    fireEvent.change(screen.getByLabelText("Sender name"), { target: { value: "x" } });
    await saveAndWait();
    const alert = await screen.findByText(/no key to encrypt the credential with/);
    expect(alert.getAttribute("role")).toBe("alert");
  });

  it("announces a transport failure without claiming anything was written", async () => {
    await mount(smtpState());
    mocks.updateMailConfig.mockRejectedValue(
      new ApiError({ status: 0, code: "network_error", message: "could not reach the server" }),
    );
    fireEvent.change(screen.getByLabelText("Sender name"), { target: { value: "x" } });
    await saveAndWait();
    expect((await screen.findByText(/Nothing was saved/)).getAttribute("role")).toBe("alert");
  });

  it("announces a 400 without claiming anything was written", async () => {
    await mount(smtpState());
    mocks.updateMailConfig.mockRejectedValue(
      new ApiError({ status: 400, code: "bad_request", message: "malformed" }),
    );
    fireEvent.change(screen.getByLabelText("Sender name"), { target: { value: "x" } });
    await saveAndWait();
    expect(await screen.findByText(/Nothing was saved/)).toBeTruthy();
  });

  it("announces a 5xx without echoing the server's scrubbed body", async () => {
    await mount(smtpState());
    mocks.updateMailConfig.mockRejectedValue(
      new ApiError({ status: 500, code: "internal", message: "an unexpected error occurred" }),
    );
    fireEvent.change(screen.getByLabelText("Sender name"), { target: { value: "x" } });
    await saveAndWait();
    expect(await screen.findByText(/Could not reach the server. Nothing was saved./)).toBeTruthy();
  });
});

// --- AC6 --------------------------------------------------------------------

describe("the save button (AC6)", () => {
  it("is never `disabled` — not while saving, not once there is nothing to save", async () => {
    await mount(smtpState());
    const button = saveButton() as HTMLButtonElement;
    button.focus();
    // Not dirty: refused, but through aria-disabled, because `disabled` on a
    // focused button blurs it to <body>.
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(button);
    expect(mocks.updateMailConfig).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Sender name"), { target: { value: "Renamed" } });
    expect(button.getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(button);
    await waitFor(() => expect(mocks.updateMailConfig).toHaveBeenCalledTimes(1));
    expect(button.disabled).toBe(false);
    expect(document.activeElement).toBe(button);
  });
});

// --- AC7 --------------------------------------------------------------------

describe("no key-encryption key (AC7)", () => {
  it("warns at page level and disables the credential field with its own note", async () => {
    await mount(
      smtpState({
        secrets_available: false,
        secret_status: "none",
        config: {
          transport: "smtp",
          from_address: "no-reply@example.org",
          from_name: "Example",
          reply_to: "",
          smtp: {
            host: "smtp.example.com",
            port: 587,
            encryption: "starttls",
            username: "",
            password_set: false,
          },
        },
      }),
    );
    expect(screen.getByText(/no key to encrypt credentials with/)).toBeTruthy();
    // The field-level note is unreachable by keyboard on a disabled control,
    // which is exactly why the page-level warning above is not optional.
    const note = screen.getByRole("note");
    expect(note.textContent).toBe("No credential key on this server.");
    expect((screen.getByLabelText("Password") as HTMLInputElement).disabled).toBe(true);
  });
});

// --- AC8 --------------------------------------------------------------------

describe("an undecryptable credential (AC8)", () => {
  it("offers an empty box rather than claiming a dead secret is saved", async () => {
    await mount(smtpState({ secret_status: "undecryptable" }));
    expect(screen.getByText(/can no longer be read/)).toBeTruthy();
    const field = screen.getByLabelText("Password") as HTMLInputElement;
    expect(field.type).toBe("password");
    expect(field.value).toBe("");
    expect(screen.queryByRole("button", { name: "Replace Password" })).toBeNull();
  });
});

// --- AC9 --------------------------------------------------------------------

describe("discarding the configuration (AC9)", () => {
  it("confirms in a dialog, and Escape closes it without deleting anything", async () => {
    await mount(
      smtpState({
        environment: {
          configured: true,
          host: "mx.example.net",
          port: 587,
          from: "env@example.net",
        },
      }),
    );
    const trigger = screen.getByRole("button", { name: "Use environment configuration" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/go back to the mail settings/)).toBeTruthy();
    expect(within(dialog).getByText(/Mail will then come from env@example\.net/)).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.resetMailConfig).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
  });

  it("names the harsher outcome when there is no environment to fall back to", async () => {
    await mount(smtpState());
    fireEvent.click(screen.getByRole("button", { name: "Remove this configuration" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/stop sending email entirely/)).toBeTruthy();
  });

  it("deletes on confirmation, reloads, and re-primes the capability snapshot", async () => {
    await mount(smtpState());
    mocks.resetMailConfig.mockResolvedValue(undefined);
    mocks.getMailConfig.mockResolvedValue(EMPTY);
    fireEvent.click(screen.getByRole("button", { name: "Remove this configuration" }));
    fireEvent.click(await screen.findByRole("button", { name: "Discard configuration" }));
    await waitFor(() => expect(mocks.resetMailConfig).toHaveBeenCalled());
    expect(mocks.refreshInstanceFeatures).toHaveBeenCalled();
    await waitFor(() => expect(mocks.getMailConfig).toHaveBeenCalledTimes(2));
  });

  it("offers no discard at all when nothing is stored here", async () => {
    await mount(EMPTY);
    expect(screen.queryByRole("button", { name: /Use environment configuration/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Remove this configuration/ })).toBeNull();
  });
});

// --- AC10 -------------------------------------------------------------------

describe("accessible names (AC10)", () => {
  it("gives every button an accessible name containing its visible text", async () => {
    await mount(smtpState());
    for (const button of screen.getAllByRole("button")) {
      const visible = (button.textContent ?? "").trim();
      if (visible === "") continue;
      const name = button.getAttribute("aria-label") ?? visible;
      expect(name.toLowerCase()).toContain(visible.toLowerCase());
    }
  });
});

// --- Status block, port rule, presets ---------------------------------------

describe("the status block", () => {
  it("leads with the silent-failure warning when nothing can send mail", async () => {
    await mount(EMPTY);
    expect(screen.getByText(/silently dropped/)).toBeTruthy();
  });

  it("says development capture holds mail rather than that the log holds it", async () => {
    await mount(smtpState({ source: "dev_capture" }));
    const warning = screen.getByText(/captured for development/);
    expect(warning.textContent).toContain("Nobody receives it");
    expect(warning.textContent).toContain("DEV_MAIL_CAPTURE_ENABLED");
  });

  it("names the environment host a DELETE would revert to, and never its login", async () => {
    await mount(
      smtpState({
        source: "environment",
        config: null,
        environment: { configured: true, host: "mx.example.net", port: 25, from: "a@example.net" },
      }),
    );
    // The From address is shipped for exactly one purpose: so the outcome of a
    // DELETE is visible before it is pressed.
    expect(screen.getByText(/mx\.example\.net, port 25, from a@example\.net/)).toBeTruthy();
  });
});

describe("the port rule", () => {
  it("never rewrites a port that came from the server", async () => {
    await mount(
      smtpState({
        config: {
          transport: "smtp",
          from_address: "no-reply@example.org",
          from_name: "Example",
          reply_to: "",
          smtp: {
            host: "smtp.example.com",
            port: 2525,
            encryption: "starttls",
            username: "postmaster",
            password_set: true,
          },
        },
      }),
    );
    const port = screen.getByLabelText("Port") as HTMLInputElement;
    expect(port.value).toBe("2525");
    // A stored port was chosen by someone: toggling encryption twice must not
    // turn a working 2525 relay back into the blocked 587 it was moved off.
    fireEvent.change(screen.getByLabelText("Encryption"), { target: { value: "none" } });
    fireEvent.change(screen.getByLabelText("Encryption"), { target: { value: "starttls" } });
    expect(port.value).toBe("2525");
  });

  it("follows the encryption mode only until the admin types a port", async () => {
    await mount();
    const port = screen.getByLabelText("Port") as HTMLInputElement;
    expect(port.value).toBe("587");
    fireEvent.change(screen.getByLabelText("Encryption"), { target: { value: "tls" } });
    expect(port.value).toBe("465");

    fireEvent.change(port, { target: { value: "2525" } });
    fireEvent.change(screen.getByLabelText("Encryption"), { target: { value: "starttls" } });
    // Never overwritten again: a suggestion becomes a sentence.
    expect(port.value).toBe("2525");
    expect(screen.getByText("Port 587 is the usual port for this setting.")).toBeTruthy();
  });
});

describe("SMTP presets", () => {
  it("fills host, port and encryption, and never travels to the server", async () => {
    await mount();
    fireEvent.change(screen.getByLabelText("Fill in settings for"), {
      target: { value: "smtp2go" },
    });
    expect((screen.getByLabelText("Server address") as HTMLInputElement).value).toBe(
      "mail.smtp2go.com",
    );
    expect((screen.getByLabelText("Port") as HTMLInputElement).value).toBe("2525");
    fireEvent.change(screen.getByLabelText("Sender address"), {
      target: { value: "a@example.org" },
    });
    await saveAndWait();
    expect(JSON.stringify(savedBody())).not.toContain("smtp2go\"");
    expect(savedBody().smtp.host).toBe("mail.smtp2go.com");
  });

  it("falls back to Custom the moment the host stops matching the preset", async () => {
    await mount();
    const presetSelect = screen.getByLabelText("Fill in settings for") as HTMLSelectElement;
    fireEvent.change(presetSelect, { target: { value: "resend" } });
    expect(presetSelect.value).toBe("resend");
    fireEvent.change(screen.getByLabelText("Server address"), { target: { value: "other.host" } });
    expect(presetSelect.value).toBe("custom");
  });
});

describe("degraded server", () => {
  it("says so plainly when the build carries no mail-config service", async () => {
    mocks.getMailConfig.mockRejectedValue(
      new ApiError({ status: 501, code: "not_implemented", message: "no service" }),
    );
    render(<EmailConfigPanel />);
    expect(await screen.findByText(/does not carry the outbound-mail configuration service/)).toBeTruthy();
    // The test button survives: it answers a different question and needs no
    // configuration document to do it.
    expect(screen.getByRole("region", { name: "Outbound mail test" })).toBeTruthy();
  });
});

describe("the page's other duties", () => {
  beforeEach(() => {
    mocks.getMailConfig.mockResolvedValue(EMPTY);
  });

  it("mounts the shared mail test, not a second copy of it", async () => {
    await mount();
    expect(screen.getByRole("region", { name: "Outbound mail test" })).toBeTruthy();
    // Rendering the page must not probe the relay — the test is a deliberate act.
    expect(mocks.sendTestMail).not.toHaveBeenCalled();
  });

  it("sends presentation settings to Customization rather than repeating them", async () => {
    await mount();
    expect(
      screen.getByRole("link", { name: "Customization → Email" }).getAttribute("href"),
    ).toBe("/admin/config/customization#config-section-email");
  });
});
