"use client";

import { RoleGate } from "@/components/RoleGate";
import { MailTestCard } from "@/components/admin/MailTestCard";
import { TextLink } from "@/components/ui/TextLink";

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

// Exported for component tests; production always enters through the role gate
// (the same pattern ConfigForm and InfrastructurePanel use).
export function EmailConfigPanel() {
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      {/* The one thing an operator cannot discover from the form itself: a
          correct SMTP configuration that simply never connects, because the
          host silently drops the port. Said before the form rather than in an
          error afterwards. */}
      <p
        role="note"
        className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-[13px] leading-relaxed text-fg-muted"
      >
        Many hosts block outbound SMTP: DigitalOcean, for one, blocks ports 25,
        465 and 587 on new accounts, so a correct relay configuration can still
        fail to connect. An API provider talks ordinary HTTPS on port 443 and
        works anywhere. Either way, publish the SPF and DKIM records your
        provider gives you — without them your mail is delivered to spam folders
        or refused outright.
      </p>

      {/* MOUNT POINT — the transport picker, the per-transport fields, the
          SecretInput credentials, the save/reset bar and the source status line
          go HERE, between the guidance above and the cross-link below. They
          need GET/PUT/DELETE /api/v1/admin/mail-config, which is not in the
          OpenAPI spec yet; this page ships without them rather than shipping a
          form against invented types (AGENTS.md rule 4, contract is
          core-first). Nothing renders in this gap on purpose: a disabled or
          empty form would read as a broken page instead of an unfinished one. */}

      <p className="text-[13px] text-fg-muted">
        The subject prefix and signature applied to every message are presentation
        settings, and live on{" "}
        <TextLink href="/admin/config/customization#config-section-email">
          Customization → Email
        </TextLink>
        .
      </p>

      <MailTestCard />
    </div>
  );
}
