"use client";

import { useCallback, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { TextLink } from "@/components/ui/TextLink";
import { api, errorMessage } from "@/lib/api";

// --- Outbound-mail probe ----------------------------------------------------

type MailPhase = "idle" | "sending" | "sent";

export type MailTestCardProps = {
  /**
   * Where to go and change the mail configuration. Passed by surfaces that are
   * NOT that page (Infrastructure), omitted by the page itself — a link back to
   * where you already are is noise, and the card must not grow two behaviours
   * for one prop's absence.
   */
  configureHref?: string;
};

/**
 * The one control that answers "does outbound mail actually work". Lifted out
 * of AdminInfrastructureView so the mail CONFIGURATION page can mount the same
 * component instead of cloning it — a second copy would be a second place for
 * the typed-error copy below to drift.
 */
export function MailTestCard({ configureHref }: MailTestCardProps = {}) {
  const [phase, setPhase] = useState<MailPhase>("idle");
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(async () => {
    setPhase("sending");
    setError(null);
    try {
      await api.sendTestMail();
      setPhase("sent");
    } catch (err) {
      setPhase("idle");
      setError(
        errorMessage(err, "Could not send the test message.", {
          // All three server messages are typed errors with stable codes
          // (mail_not_configured / conflict / mail_test_failed) precisely so
          // the api's generic 5xx scrub cannot replace them on the wire; these
          // overrides only add the "what do I do next" half for this UI.
          "503":
            "This deployment has no outbound mail configured, so there is nothing to test. Set up an SMTP relay and restart the server.",
          "409":
            "No instance contact email is set, so there is nowhere to send the test. Set contact_email on the General config page first.",
          mail_test_failed:
            "The mail relay refused the message. The relay's own answer is in the server log — it routinely quotes the recipient address, so it is not repeated here.",
        }),
      );
    }
  }, []);

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
          <Button onClick={() => void send()} disabled={phase === "sending"}>
            {phase === "sending" ? "Sending…" : "Send test message"}
          </Button>
          {phase === "sending" ? (
            <Spinner label="Sending test message" />
          ) : null}
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

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      {phase === "sent" ? (
        <Card className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Badge variant="success">Handed to the relay</Badge>
          </div>
          <p className="text-sm text-fg-muted">
            The message was accepted for delivery to this instance&rsquo;s
            contact address. Acceptance is a promise to try, not proof of
            delivery — check that inbox to confirm it actually arrived.
          </p>
        </Card>
      ) : null}
    </section>
  );
}
