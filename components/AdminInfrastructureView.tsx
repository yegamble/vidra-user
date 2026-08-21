"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { RoleGate } from "@/components/RoleGate";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { api, errorMessage } from "@/lib/api";
import type { InfrastructureFeature, InfrastructureStatus } from "@/lib/api";
import { formatBytes } from "@/lib/format";

type Status = "loading" | "error" | "ready";

// AdminInfrastructureView is the admin-only DEPLOY-TIME view of this instance:
// what the operator chose at install time (server limits, storage backend,
// networking, the backup contract) plus a discovery list of the optional
// subsystems that shipped with vidra and their honest on/configured state.
//
// It is the sibling of AdminSystemStatusView, not a replacement: that page
// answers "is it healthy right now", this one answers "what did we actually
// deploy, and what did we leave switched off". The server guarantees the
// payload carries no secrets (no DSN, no S3 keys, no SMTP credentials), so
// everything here is safe to render verbatim.
//
// Read-only apart from the outbound-mail probe. Role-gated by RoleGate — an
// under-privileged/anonymous viewer sees the shared permission prompt and
// nothing fetches.
export function AdminInfrastructureView() {
  return (
    <RoleGate minRole="admin" action="view infrastructure">
      <InfrastructurePanel />
    </RoleGate>
  );
}

// Exported for unit tests (rendered directly, bypassing the RoleGate wrapper —
// the same pattern ConfigForm uses). Production always enters via
// AdminInfrastructureView so the admin gate applies.
export function InfrastructurePanel() {
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<InfrastructureStatus | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getInfrastructure(controller.signal)
      .then((res) => {
        setData(res);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [reloadKey]);

  const refresh = useCallback(() => {
    setStatus("loading");
    setReloadKey((k) => k + 1);
  }, []);

  if (status === "loading") {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading infrastructure" />
      </div>
    );
  }
  if (status === "error" || data === null) {
    return (
      <ErrorState
        message="Could not load the infrastructure summary."
        onRetry={refresh}
      />
    );
  }

  const { server, storage, networking, backups } = data;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Badge
          variant={networking.https_effective ? "success" : "warning"}
          status
        >
          {networking.https_effective ? "HTTPS" : "Plain HTTP"}
        </Badge>
        <Badge variant="neutral" status>
          {server.environment}
        </Badge>
        <Button variant="secondary" size="sm" onClick={refresh}>
          Refresh
        </Button>
      </div>

      <Panel
        title="Server"
        description="Runtime environment and the request limits this process enforces."
      >
        <Row label="Environment" value={server.environment} />
        <Row
          label="Request timeout"
          value={`${server.request_timeout_seconds}s`}
        />
        <Row
          label="Streaming timeout"
          value={`${server.stream_request_timeout_seconds}s`}
        />
        <Row label="Body limit" value={server.body_limit} mono />
        <Row
          label="Max upload size"
          value={
            server.upload_max_bytes === 0
              ? "No cap"
              : formatBytes(server.upload_max_bytes)
          }
        />
        <Row label="Metrics endpoint" value={onOff(server.metrics_enabled)} />
        <Row
          label="Tracing"
          value={
            server.tracing_enabled ? `On (${server.tracing_protocol})` : "Off"
          }
        />
      </Panel>

      <Panel
        title="Storage"
        description="Where media bytes are written. Credentials are never included in this view."
      >
        <Row
          label="Backend"
          value={
            storage.backend === "s3" ? "Object storage (S3)" : "Local disk"
          }
        />
        {storage.backend === "s3" ? (
          <>
            <Row label="Endpoint" value={storage.s3_endpoint} mono />
            <Row label="Bucket" value={storage.s3_bucket} mono />
            <Row label="Region" value={storage.s3_region} />
            <Row label="TLS" value={onOff(storage.s3_use_ssl)} />
            <Row
              label="Path-style addressing"
              value={onOff(storage.s3_force_path_style)}
            />
          </>
        ) : (
          <Row label="Media directory" value={storage.local_root} mono />
        )}
      </Panel>

      <Panel
        title="Networking"
        description="How browsers and other instances reach this server."
      >
        <Row label="Public address" value={networking.public_base_url} mono />
        <Row
          label="Served over HTTPS"
          value={yesNo(networking.https_effective)}
        />
        <Row
          label="Plain HTTP allowed"
          value={yesNo(networking.allow_plain_http)}
        />
        <Row
          label="Extra trusted proxies"
          value={listOr(networking.trusted_proxy_cidrs, "None")}
        />
        <Row
          label="Allowed browser origins"
          value={listOr(networking.cors_allowed_origins, "None")}
        />
        <Row
          label="ActivityPub federation"
          value={onOff(networking.federation_enabled)}
        />
        <Row
          label="ATProto cross-posting"
          value={onOff(networking.atproto_enabled)}
        />
        <Row
          label="Sign in with ATProto"
          value={onOff(networking.atproto_login_enabled)}
        />
      </Panel>

      {/* Backups are the one section that reports a CONTRACT rather than live
          state. The api container cannot see the deploy directory the dumps are
          written to, so claiming "last backup: 3h ago" here would be a guess
          dressed as a fact. It states what is supposed to happen and names the
          tool that can actually check — which is the honest, and more useful,
          answer. */}
      <Panel
        title="Backups"
        description="The backup contract for this deployment. This page reports the policy, not live state."
      >
        <Row
          label="Database"
          value={
            backups.external_postgres
              ? "Managed externally"
              : "In this deployment"
          }
        />
      </Panel>
      <Card className="flex flex-col gap-2 text-sm text-fg-muted">
        <p>{backups.schedule_note}</p>
        <p>{backups.staleness_note}</p>
        <p>{backups.artifacts_note}</p>
        <p className="text-fg">{backups.live_state_note}</p>
      </Card>

      <FeatureList features={data.features} />

      <MailTestCard />
    </div>
  );
}

// --- Feature discovery ------------------------------------------------------

/**
 * Operator-facing labels for the server's fixed feature vocabulary. An unknown
 * key is humanized rather than dropped: the server may ship a new feature
 * before this client knows its name, and silently hiding it would defeat the
 * whole point of a discovery list.
 */
const FEATURE_LABEL: Record<string, string> = {
  object_storage: "Object storage",
  mail: "Outbound mail",
  search: "Search service",
  federation: "ActivityPub federation",
  atproto: "ATProto cross-posting",
  atproto_login: "Sign in with ATProto",
  malware_scan: "Malware scanning",
  captions: "Automatic captions",
  live: "Live streaming",
  ipfs: "IPFS mirrors",
  tracing: "Distributed tracing",
  metrics: "Prometheus metrics",
  vp9_alternates: "VP9 alternate renditions",
};

/**
 * Where an operator goes to act on a feature AT RUNTIME. Deliberately partial:
 * only features with a real runtime setting get a link. The rest (object
 * storage, ATProto, malware scanning, tracing, metrics, VP9) are boot-env
 * decisions with no page to send anyone to, and a link that lands on a page
 * without the promised switch is worse than no link at all — the operator hunts
 * for a control that was never there.
 *
 * Keyed on the server's stable feature vocabulary, so this mapping is the
 * client's to own (the contract fixes the keys, not the destinations).
 */
const FEATURE_CONFIG_PAGE: Record<string, string> = {
  // The probe below sends to the contact address, which lives on General.
  mail: "/admin/config/general",
  search: "/admin/config/advanced",
  federation: "/admin/config/federation",
  captions: "/admin/config/vod",
  live: "/admin/config/live",
  ipfs: "/admin/config/ipfs",
};

function featureLabel(key: string): string {
  return FEATURE_LABEL[key] ?? key.replace(/_/g, " ");
}

function FeatureList({ features }: { features: InfrastructureFeature[] }) {
  return (
    <section aria-label="Optional features" className="flex flex-col gap-3">
      <div>
        <h2 className="text-[15px] font-bold tracking-tight">
          Optional features
        </h2>
        <p className="text-[13px] text-fg-muted">
          Everything vidra can do beyond the core. &ldquo;Enabled&rdquo; is your
          switch; &ldquo;configured&rdquo; is whether this deployment supplies
          what the feature needs.
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-border-subtle rounded-2xl border border-border-subtle bg-surface px-4">
        {features.map((feature) => (
          <FeatureRow key={feature.key} feature={feature} />
        ))}
      </ul>
    </section>
  );
}

function FeatureRow({ feature }: { feature: InfrastructureFeature }) {
  const { enabled, configured } = feature;
  // Three states, because two booleans that disagree are the interesting case:
  // an operator who turned something on and never finished wiring it up gets a
  // warning, not a green pill that lies to them.
  const variant = !enabled ? "neutral" : configured ? "success" : "warning";
  const label = !enabled ? "Off" : configured ? "Active" : "Needs setup";
  const href = FEATURE_CONFIG_PAGE[feature.key];

  return (
    <li className="flex flex-col gap-1 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-sm font-medium text-fg">
          {featureLabel(feature.key)}
        </span>
        <Badge variant={variant} status>
          {label}
        </Badge>
      </div>
      {/* The server sends a note in two different situations and they do not
          deserve the same framing. For a feature that is OFF the note is
          discovery copy — here is something you could turn on — so it is
          prefixed "Optional". For one that is ON but unconfigured the note is a
          finding: mail that cannot deliver is not an optional extra, and
          labelling it that way would talk an operator out of fixing it. */}
      {feature.note ? (
        <p className="text-[13px] text-fg-muted">
          {enabled ? "" : "Optional: "}
          {feature.note}
          {href ? (
            <>
              {" "}
              <Link
                href={href}
                className="font-medium text-accent hover:underline"
              >
                Open settings
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
    </li>
  );
}

// --- Outbound-mail probe ----------------------------------------------------

type MailPhase = "idle" | "sending" | "sent";

function MailTestCard() {
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
          // The server's own copy for these is already precise and operator-
          // facing; these overrides only add the "what do I do next" half.
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

// --- Shared bits ------------------------------------------------------------

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title}>
      <h2 className="text-[15px] font-bold tracking-tight">{title}</h2>
      <p className="mb-2 text-[13px] text-fg-muted">{description}</p>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        {children}
      </dl>
    </section>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3 border-b border-border-subtle py-1.5">
      <dt className="text-fg-muted">{label}</dt>
      <dd
        className={
          mono
            ? "truncate font-mono text-[13px] text-fg"
            : "text-fg tabular-nums"
        }
      >
        {value || "—"}
      </dd>
    </div>
  );
}

function onOff(on: boolean): string {
  return on ? "On" : "Off";
}

function yesNo(yes: boolean): string {
  return yes ? "Yes" : "No";
}

function listOr(items: string[], empty: string): string {
  return items.length === 0 ? empty : items.join(", ");
}
