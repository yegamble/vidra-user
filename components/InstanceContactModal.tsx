"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { contactInstance, errorMessage, fieldErrors } from "@/lib/api";

// InstanceContactModal is the /about contact form (spec:
// instance-platform-info.md): name/email/subject/message → POST
// /api/v1/instance/contact. Failure copy is honest and specific:
//  - 422 field errors map inline onto their inputs;
//  - 409 contact_form_disabled → the form is off (toggle/email/mail);
//  - 429 → the 1-message-per-hour limit.
// On 202 the form gives way to a sent confirmation.
export function InstanceContactModal({
  instanceName,
  onClose,
}: {
  instanceName: string;
  onClose: () => void;
}) {
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const canSend =
    !sending &&
    fromName.trim() !== "" &&
    fromEmail.trim() !== "" &&
    subject.trim() !== "" &&
    body.trim() !== "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    setSending(true);
    setError(null);
    setFields({});
    try {
      await contactInstance({
        from_name: fromName.trim(),
        from_email: fromEmail.trim(),
        subject: subject.trim(),
        body: body.trim(),
      });
      setSent(true);
    } catch (err) {
      const f = fieldErrors(err);
      if (f) {
        setFields(f);
        setError("Some fields need attention — see the highlighted inputs.");
      } else {
        setError(
          errorMessage(err, "Could not send your message. Please try again.", {
            contact_form_disabled: "The contact form is disabled on this instance.",
            "429": "You can only send one message per hour — please try again later.",
          }),
        );
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal title={`Contact ${instanceName}`} onClose={onClose}>
      {sent ? (
        <div className="flex flex-col gap-4">
          <p role="status" className="text-sm text-fg">
            Your message has been sent to the administrators.
          </p>
          <div className="flex justify-end">
            <Button type="button" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
          <Input
            label="Your name"
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
            maxLength={120}
            error={fields.from_name}
          />
          <Input
            label="Your email"
            type="email"
            value={fromEmail}
            onChange={(e) => setFromEmail(e.target.value)}
            maxLength={254}
            error={fields.from_email}
          />
          <Input
            label="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={120}
            error={fields.subject}
          />
          <Textarea
            label="Message"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            maxLength={5000}
            hint="At least 10 characters."
            error={fields.body}
            className="resize-y"
          />
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={sending}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSend}>
              {sending ? "Sending…" : "Send message"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
