// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sendTestMail: vi.fn() }));

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: { ...actual.api, sendTestMail: mocks.sendTestMail },
  };
});

import { ApiError } from "@/lib/api";

import { MailTestCard, mailFailureCopy } from "./MailTestCard";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const CONFIGURE = { name: "Configure email →" };
const sendButton = () => screen.getByRole("button", { name: /Send test message|Sending/ });

function mailError(args: {
  status?: number;
  code?: string;
  message?: string;
  reason?: Parameters<typeof mailFailureCopy>[0];
  port?: number;
}): ApiError {
  return new ApiError({
    status: args.status ?? 502,
    code: args.code ?? "mail_test_failed",
    message: args.message ?? "the relay refused the message",
    mailReason: args.reason,
    mailPort: args.port,
  });
}

describe("MailTestCard", () => {
  it("announces acceptance as a promise to try, in a live region", async () => {
    mocks.sendTestMail.mockResolvedValue({});
    render(<MailTestCard />);
    fireEvent.click(sendButton());
    // role=status, not a silent Card: the only button on the page must not
    // answer a keyboard user with silence. (Queried by text because the
    // Spinner is itself a status region while the send is in flight.)
    const ok = await screen.findByText(/not proof of\s+delivery/);
    expect(ok.getAttribute("role")).toBe("status");
    expect(ok.textContent).toMatch(/SPF and\s+DKIM/);
  });

  it("announces a failure in an alert region", async () => {
    mocks.sendTestMail.mockRejectedValue(mailError({ reason: "auth_failed" }));
    render(<MailTestCard />);
    fireEvent.click(sendButton());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("The provider rejected the username or key.");
  });

  it("sends an unconfigured instance to the form, not to a server restart", async () => {
    mocks.sendTestMail.mockRejectedValue(
      new ApiError({ status: 503, code: "mail_not_configured", message: "no mail path" }),
    );
    render(<MailTestCard />);
    fireEvent.click(sendButton());
    const alert = await screen.findByRole("alert");
    // This card now sits on the page that configures mail live. Telling the
    // admin to restart the server is telling them to SSH out of the surface
    // built to keep them out of SSH.
    expect(alert.textContent).not.toMatch(/restart/i);
    expect(alert.textContent).toContain("Choose how mail should be sent");
  });

  it("never disables the button the user just pressed", async () => {
    let settle: (v: unknown) => void = () => {};
    mocks.sendTestMail.mockReturnValue(new Promise((resolve) => (settle = resolve)));
    render(<MailTestCard />);
    const button = sendButton();
    button.focus();
    fireEvent.click(button);
    await waitFor(() => expect(button.textContent).toBe("Sending…"));
    // A browser blurs a focused element the moment it becomes disabled, so the
    // keyboard user would be dropped to <body> mid-send.
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(button);
    settle({});
    await screen.findByText(/not proof of\s+delivery/);
  });

  it("ignores a second press while one send is in flight", async () => {
    let settle: (v: unknown) => void = () => {};
    mocks.sendTestMail.mockReturnValue(new Promise((resolve) => (settle = resolve)));
    render(<MailTestCard />);
    fireEvent.click(sendButton());
    fireEvent.click(sendButton());
    expect(mocks.sendTestMail).toHaveBeenCalledTimes(1);
    settle({});
    await screen.findByText(/not proof of\s+delivery/);
  });

  it("names the blocked submission port when a reachable-looking relay times out", async () => {
    mocks.sendTestMail.mockRejectedValue(mailError({ reason: "connect_failed", port: 587 }));
    render(<MailTestCard smtpHost="smtp.example.com" smtpPort={587} />);
    fireEvent.click(sendButton());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not reach smtp.example.com on port 587.");
    expect(alert.textContent).toContain("DigitalOcean blocks all three");
  });

  it("offers the way out of a dead end only where that is somewhere else", () => {
    const { unmount } = render(<MailTestCard configureHref="/admin/config/email" />);
    expect(screen.getByRole("link", CONFIGURE).getAttribute("href")).toBe(
      "/admin/config/email",
    );
    unmount();

    // On the mail configuration page itself the link would point at the page
    // the reader is already on.
    render(<MailTestCard />);
    expect(screen.queryByRole("link", CONFIGURE)).toBeNull();
  });
});

describe("mailFailureCopy", () => {
  const ctx = { smtpHost: "smtp.example.com", smtpPort: 587, fromAddress: "no-reply@example.org" };

  it("names the port-blocking remedy only on 25, 465 and 587", () => {
    for (const port of [25, 465, 587]) {
      expect(mailFailureCopy("timeout", port, ctx)).toContain("port 2525");
    }
    const other = mailFailureCopy("timeout", 2525, ctx);
    expect(other).toContain("Could not reach smtp.example.com on port 2525.");
    expect(other).not.toContain("DigitalOcean");
  });

  it("prefers the port the server says failed over the configured one", () => {
    expect(mailFailureCopy("connect_failed", 465, ctx)).toContain("on port 465.");
  });

  it("quotes the sender address the provider refused", () => {
    expect(mailFailureCopy("sender_rejected", undefined, ctx)).toContain(
      "will not send from no-reply@example.org",
    );
  });

  it("degrades to neutral wording when the panel knows no host", () => {
    expect(mailFailureCopy("connect_failed", 2525, {})).toBe(
      "Could not reach the mail server on port 2525. Check the address and port, and that this server is allowed to make outbound connections.",
    );
  });

  it("covers every reason the contract defines", () => {
    const reasons = [
      "auth_failed",
      "sender_rejected",
      "rate_limited",
      "provider_unavailable",
      "timeout",
      "connect_failed",
      "tls_failed",
      "rejected",
      "secret_undecryptable",
    ] as const;
    for (const reason of reasons) {
      expect(mailFailureCopy(reason, undefined, ctx).length).toBeGreaterThan(20);
    }
  });
});
