"use client";

import { useCallback, useRef, useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { TextLink } from "@/components/ui/TextLink";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { MailSendFailureReason } from "@/lib/api";

// --- Outbound-mail probe ----------------------------------------------------

type MailPhase = "idle" | "sending" | "sent";

/**
 * The submission ports hosting providers block. DigitalOcean — the commonest
 * vidra host — blocks all three on every Droplet including Reserved IPs, with
 * no documented appeal, so `connect_failed` on one of them is a configuration
 * that is probably correct and can simply never connect.
 */
const BLOCKED_SUBMISSION_PORTS = new Set([25, 465, 587]);

export type MailTestCardProps = {
  /**
   * Where to go and change the mail configuration. Passed by surfaces that are
   * NOT that page (Infrastructure), omitted by the page itself — a link back to
   * where you already are is noise, and the card must not grow two behaviours
   * for one prop's absence.
   */
  configureHref?: string;
  /**
   * The SMTP host in force, purely so a "could not reach it" failure can name
   * what could not be reached. The card is handed this rather than fetching the
   * configuration itself: the page that owns the form has already loaded it,
   * and a second read is a second thing that can disagree.
   */
  smtpHost?: string;
  /** The configured SMTP port, used only when the failure envelope omits one. */
  smtpPort?: number;
  /** The configured sender address, for the "the provider will not send from…" copy. */
  fromAddress?: string;
};

type FailureContext = Pick<MailTestCardProps, "smtpHost" | "smtpPort" | "fromAddress">;

/**
 * The typed half of a send failure turned into the remedy it implies. A blocked
 * submission port, an unverified sending domain and a wrong password are three
 * different fixes and one generic sentence, which is the whole reason core
 * classifies the failure rather than echoing the relay's own words (those quote
 * the recipient address back, so they stay in the server log).
 *
 * Exported so the mapping is testable on its own — every branch here is copy an
 * operator acts on, and copy that is only reachable through a mocked network
 * failure is copy nobody checks.
 */
export function mailFailureCopy(
  reason: MailSendFailureReason,
  port: number | undefined,
  ctx: FailureContext,
): string | undefined {
  const host = ctx.smtpHost && ctx.smtpHost !== "" ? ctx.smtpHost : "the mail server";
  const effectivePort = port ?? ctx.smtpPort;
  const where =
    effectivePort === undefined
      ? `Could not reach ${host}.`
      : `Could not reach ${host} on port ${effectivePort}.`;

  switch (reason) {
    case "auth_failed":
      return "The provider rejected the username or key. Re-enter the credential and save before testing again.";
    case "sender_rejected":
      return `The provider will not send from ${
        ctx.fromAddress && ctx.fromAddress !== "" ? ctx.fromAddress : "this sender address"
      }. Verify that address or its domain with the provider, then try again.`;
    case "rate_limited":
      return "The provider is rate-limiting this instance. Wait a few minutes and test again.";
    case "provider_unavailable":
      return "The provider did not answer. This is on their side — try again shortly; their status page will say more.";
    case "timeout":
    case "connect_failed":
      return effectivePort !== undefined && BLOCKED_SUBMISSION_PORTS.has(effectivePort)
        ? `${where} Many hosts block outbound mail on ports 25, 465 and 587 — DigitalOcean blocks all three. Two ways out: use port 2525 if your provider offers it, or switch to an API provider, which sends over ordinary HTTPS.`
        : `${where} Check the address and port, and that this server is allowed to make outbound connections.`;
    case "tls_failed":
      return "The encrypted connection could not be established. Try “Encrypted after connecting (STARTTLS)” on port 587, or “Encrypted from the start” on port 465.";
    case "rejected":
      return "The provider refused the message. Its reason is in the server log — it quotes the recipient address, so it is not repeated here.";
    case "secret_undecryptable":
      return "The saved credential can no longer be read. Enter it again and save, then test.";
  }
  // Unreachable while the switch is exhaustive — and tsc still fails here the
  // day core adds a member. But core and this client ship on separate tags, so
  // at RUNTIME a newer reason really can arrive, and returning undefined from
  // an exhaustive switch is how the only diagnostic button on the page answers
  // a 502 with a blank screen. The caller substitutes the generic copy.
  return undefined;
}

/**
 * The one control that answers "does outbound mail actually work". Lifted out
 * of AdminInfrastructureView so the mail CONFIGURATION page can mount the same
 * component instead of cloning it — a second copy would be a second place for
 * the typed-error copy below to drift.
 */
export function MailTestCard({
  configureHref,
  smtpHost,
  smtpPort,
  fromAddress,
}: MailTestCardProps = {}) {
  const [phase, setPhase] = useState<MailPhase>("idle");
  const [error, setError] = useState<string | null>(null);

  const inFlight = useRef(false);

  const send = useCallback(async () => {
    // The button stays ENABLED while sending (a browser blurs a focused element
    // the moment it is disabled, dropping the keyboard user to <body>), so this
    // guard — not the DOM — is what makes a second Enter a no-op. A ref, not
    // the phase state, because two Enters in one tick see the same stale state.
    if (inFlight.current) return;
    inFlight.current = true;
    setPhase("sending");
    setError(null);
    try {
      await api.sendTestMail();
      setPhase("sent");
    } catch (err) {
      setPhase("idle");
      const reasonCopy =
        err instanceof ApiError && err.mailReason
          ? mailFailureCopy(err.mailReason, err.mailPort, { smtpHost, smtpPort, fromAddress })
          : undefined;
      // A reason this build predates yields no copy, and an empty Alert is a
      // 502 answered with a blank screen — so the generic path is the floor,
      // never a branch the typed path skips past.
      const fallback = errorMessage(err, "Could not send the test message.", {
        // All four server messages are typed errors with stable codes
        // (mail_not_configured / conflict / rate_limited / mail_test_failed)
        // precisely so the api's generic 5xx scrub cannot replace them on the
        // wire; these overrides only add the "what do I do next" half.
        "503":
          "This instance has no outbound mail configured yet. Choose how mail should be sent, save, then test again.",
        "409":
          "No instance contact email is set, so there is nowhere to send the test. Set contact_email on the General config page first.",
        // The app-wide 429 copy says "wait a moment"; this endpoint's budget is
        // 10 messages per admin per hour, so a moment is the wrong advice.
        "429":
          "This instance allows 10 test messages per admin per hour, and that budget is spent. Try again later in the hour.",
        mail_test_failed:
          "The mail relay refused the message. The relay's own answer is in the server log — it routinely quotes the recipient address, so it is not repeated here.",
      });
      setError(reasonCopy ?? fallback);
    } finally {
      inFlight.current = false;
    }
  }, [smtpHost, smtpPort, fromAddress]);

  const sending = phase === "sending";

  return (
    <section aria-label="Outbound mail test" className="flex flex-col gap-3">
      <Card className="flex flex-col gap-3">
        <div>
          <h2 className="text-[15px] font-bold tracking-tight">
            Test outbound mail
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            Send one probe message to find out whether mail works before a user
            needs a password reset. It goes to this instance&rsquo;s own contact
            address — you cannot choose the recipient, which is what keeps this
            button from being a relay for anyone who gets an admin password.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* aria-disabled, never disabled: the user activated this button, so
              taking it out of the accessibility tree mid-press is how keyboard
              context is lost on every send. */}
          <Button onClick={() => void send()} aria-disabled={sending || undefined}>
            {sending ? "Sending…" : "Send test message"}
          </Button>
          {sending ? <Spinner label="Sending test message" /> : null}
          {/* The next move after a failed probe, and the only one this card
              cannot make itself. Beside the button rather than inside an error,
              so it is also there for an operator who has not tested yet. */}
          {configureHref ? (
            <TextLink href={configureHref} className="text-sm">
              Configure email →
            </TextLink>
          ) : null}
        </div>
      </Card>

      {/* Alert, not a hand-rolled <p role="alert"> / silent success Card: the
          role rides the primitive, so neither tone can be announced to nobody. */}
      {error ? <Alert variant="danger">{error}</Alert> : null}

      {phase === "sent" ? (
        <Alert variant="success">
          The message was accepted for delivery to this instance&rsquo;s contact
          address. Acceptance is a promise to try, not proof of delivery — check
          that inbox. If it never arrives or lands in spam, publish the SPF and
          DKIM records your provider gives you: without them most mail is
          filtered or refused outright.
        </Alert>
      ) : null}
    </section>
  );
}
