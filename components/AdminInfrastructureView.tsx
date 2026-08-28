"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { RoleGate } from "@/components/RoleGate";
import { Badge } from "@/components/ui/Badge";
import type { BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Spinner } from "@/components/ui/Spinner";
import { api, errorMessage } from "@/lib/api";
import type {
  InfrastructureFeature,
  InfrastructureStatus,
  InfrastructureStorage,
  StorageMigration,
  StorageMigrationState,
  SystemStatusComponent,
} from "@/lib/api";
import { formatBytes, formatDateTime } from "@/lib/format";

type Status = "loading" | "error" | "ready";

/**
 * What VIDRA_ROLE means for THIS process, spelled out because the enum alone
 * does not say where the background workers went. An unmapped value renders
 * verbatim — a future role must show up, not vanish.
 */
const ROLE_DESCRIPTION: Record<string, string> = {
  all: "all — this process also runs the background workers",
  api: "api — background workers run in separate worker processes",
};

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

  const { server, storage, networking, backups, delivery, live } = data;

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
        {/* VIDRA_ROLE — boot-baked topology. Worth a sentence, not just the
            enum: a fleet accidentally deployed all-api runs zero workers (no
            transcodes, no media GC) and is otherwise indistinguishable from a
            healthy all-in-one install. Guarded: an older backend without the
            field drops the row rather than rendering undefined. */}
        {server.role ? (
          <Row
            label="Process role"
            value={ROLE_DESCRIPTION[server.role] ?? server.role}
          />
        ) : null}
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
        {/* Belongs with the request limits rather than with the pool: it is how
            long this process keeps answering requests after SIGTERM. Zero is
            the default and is correct on a single node, so it is reported with
            its consequence attached rather than as a bare "0s" that reads like
            a value nobody set — behind a load balancer it is a connection reset
            on a real request at every deploy. */}
        <Row
          label="Shutdown drain delay"
          value={
            server.drain_delay_seconds === 0
              ? "None — closes immediately"
              : humanSeconds(server.drain_delay_seconds)
          }
        />
      </Panel>

      {/* Sizing only. The live counts (how much of this pool is checked out
          right now) are a probe, so they live on the system status page — this
          panel is what the deployment ASKED for, which is what makes the live
          number readable when an operator gets there. */}
      <Panel
        title="Database"
        description="This process's PostgreSQL connection pool. Every api and worker process opens its own, so the server-wide demand is this multiplied by however many are running."
      >
        <Row label="Max connections" value={String(server.db_max_conns)} />
        <Row label="Warm minimum" value={String(server.db_min_conns)} />
        <Row
          label="Connection lifetime"
          value={humanSeconds(server.db_conn_max_lifetime_seconds)}
        />
        <Row
          label="Idle timeout"
          value={humanSeconds(server.db_conn_max_idle_time_seconds)}
        />
      </Panel>

      <Panel
        title="Storage"
        description="Where media bytes are written. Credentials are never included in this view."
        footer={<StorageLive backend={storage.backend} />}
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

      {/* ABSENT when FEATURE_LIVE is off; PRESENT with empty strings when live
          is enabled with nothing behind it — Row renders "" as "—", so the
          empty coordinates read as the gap they are, never as zero-facts. The
          ingest SECRET is never in the payload, only the coordinates every
          streamer is handed anyway. */}
      {live ? (
        <Panel
          title="Live ingest"
          description="The live plane's coordinates: where encoders send RTMP and where the segments land."
        >
          <Row label="RTMP URL" value={live.rtmp_url} mono />
          <Row label="HLS root" value={live.hls_root} mono />
        </Panel>
      ) : null}

      <Panel
        title="Networking"
        description="How browsers and other instances reach this server."
      >
        <Row label="Public address" value={networking.public_base_url} mono />
        {/* DELIVERY_CDN_BASE_URL verbatim — definitionally public (every
            viewer's player fetches segments from it), reported so confirming
            WHICH edge is wired does not need an SSH session. The block is
            ABSENT when no CDN is wired, so the row drops with it. */}
        {delivery ? (
          <Row label="CDN base URL" value={delivery.cdn_base_url} mono />
        ) : null}
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

// --- Live media-store state -------------------------------------------------

/**
 * The key the server files its object-store probe under in
 * SystemStatus.components. It is the backend's own probe vocabulary
 * ("s3"/"smtp"/"search"/"ffmpeg"), not a display name, so it is looked up
 * rather than iterated — and a missing key is reported as "not reported"
 * instead of being quietly rendered as healthy.
 */
const OBJECT_STORE_COMPONENT = "s3";

/** Campaign states nothing further happens from. */
const TERMINAL_MIGRATION_STATES = new Set<StorageMigrationState>([
  "done",
  "cancelled",
  "failed",
]);

/**
 * Operator-facing phase names. Exhaustive over the contract's union on purpose:
 * a phase added core-side becomes a type error here rather than a raw
 * snake_case string leaking into the page.
 */
const MIGRATION_STATE_LABEL: Record<StorageMigrationState, string> = {
  enumerating: "Listing the source",
  copying: "Copying",
  synced: "Synced — ready to cut over",
  cutover: "Cut over — grace period running",
  deleting_source: "Deleting the old copies",
  done: "Done",
  cancelled: "Cancelled",
  failed: "Failed",
};

const MIGRATION_STATE_VARIANT: Record<StorageMigrationState, BadgeVariant> = {
  enumerating: "accent",
  copying: "accent",
  // The one phase that is waiting on a human: everything is verified in the
  // destination and the operator has to swap the environment and restart.
  synced: "warning",
  cutover: "accent",
  deleting_source: "accent",
  done: "success",
  cancelled: "neutral",
  failed: "danger",
};

type Fetched<T> = { status: Status; data: T };

/**
 * StorageLive is the Storage panel's live half: is the object store actually
 * reachable right now, and is a media-store migration in flight. Both answers
 * come from endpoints the deploy-shape payload deliberately does not carry
 * (they cost a round trip to the bucket / a query), so they fetch separately
 * and fail separately — neither can blank the page around them.
 *
 * READ-ONLY BY DESIGN: there is no Start/Cancel button here and this wave does
 * not add one. A migration is bracketed by an environment swap and a restart
 * that a browser cannot perform, so the campaign is driven from the runbook
 * ("Moving the media store" in the operations guide) and this page reports it.
 */
function StorageLive({ backend }: { backend: InfrastructureStorage["backend"] }) {
  const [probe, setProbe] = useState<Fetched<SystemStatusComponent | null>>({
    status: "loading",
    data: null,
  });
  const [campaigns, setCampaigns] = useState<Fetched<StorageMigration[]>>({
    status: "loading",
    data: [],
  });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getSystemStatus(controller.signal)
      .then((res) =>
        setProbe({
          status: "ready",
          data: res.components[OBJECT_STORE_COMPONENT] ?? null,
        }),
      )
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setProbe({ status: "error", data: null });
      });
    api
      .getStorageMigrations(controller.signal)
      .then((res) => setCampaigns({ status: "ready", data: res.migrations }))
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setCampaigns({ status: "error", data: [] });
      });
    return () => controller.abort();
  }, [reloadKey]);

  // One button for both: they are the same question asked of two endpoints
  // ("what is the media store doing right now"), and refreshing half of it
  // would leave the panel internally inconsistent.
  const recheck = useCallback(() => {
    setProbe({ status: "loading", data: null });
    setCampaigns({ status: "loading", data: [] });
    setReloadKey((k) => k + 1);
  }, []);

  const active = campaigns.data.find(
    (m) => !TERMINAL_MIGRATION_STATES.has(m.state),
  );
  // The list is newest-first, so [0] is the campaign to report when none run.
  const last = campaigns.data[0];
  const pill = probeBadge(probe.status, probe.data);

  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle py-1.5 text-sm">
        <span className="text-fg-muted">Object store reachable</span>
        <span className="flex items-center gap-2">
          <Badge variant={pill.variant} status>
            {pill.label}
          </Badge>
          <Button variant="secondary" size="sm" onClick={recheck}>
            Re-check
          </Button>
        </span>
      </div>
      <ProbeNote backend={backend} probe={probe} />

      {active ? <MigrationCard campaign={active} /> : null}
      {!active && campaigns.status === "ready" && last ? (
        <p className="text-[13px] text-fg-muted">
          Last migration: {MIGRATION_STATE_LABEL[last.state].toLowerCase()} on{" "}
          {formatDateTime(last.updated_at)}.
        </p>
      ) : null}
      {campaigns.status === "error" ? (
        <p className="text-[13px] text-fg-muted">
          The migration history could not be read, so this panel cannot say
          whether one is running.
        </p>
      ) : null}

      {backend === "local" &&
      campaigns.status === "ready" &&
      campaigns.data.length === 0 ? (
        <ObjectStorageDiscoveryCard />
      ) : null}
    </div>
  );
}

function probeBadge(
  status: Status,
  component: SystemStatusComponent | null,
): { variant: BadgeVariant; label: string } {
  if (status === "loading") return { variant: "neutral", label: "Checking" };
  if (status === "error" || component === null) {
    return { variant: "neutral", label: "Not reported" };
  }
  if (component.status === "ok") return { variant: "success", label: "Yes" };
  if (component.status === "not_configured") {
    return { variant: "neutral", label: "Not applicable" };
  }
  return { variant: "danger", label: "No" };
}

/**
 * The sentence under the probe pill. The server's own error text is rendered
 * verbatim when there is one — it is written to be operator-facing (a category
 * or an instruction) and paraphrasing it would lose the only specific fact on
 * the row.
 */
function ProbeNote({
  backend,
  probe,
}: {
  backend: InfrastructureStorage["backend"];
  probe: Fetched<SystemStatusComponent | null>;
}) {
  if (probe.status === "loading") return null;
  if (probe.status === "error") {
    return (
      <p className="text-[13px] text-fg-muted">
        The health check could not be reached, so this is unknown rather than
        healthy.
      </p>
    );
  }
  const component = probe.data;
  if (component === null) {
    return (
      <p className="text-[13px] text-fg-muted">
        This server did not report an object-store check.
      </p>
    );
  }
  if (component.status === "not_configured") {
    return (
      <p className="text-[13px] text-fg-muted">
        {backend === "local"
          ? "Media is written to this server's own disk, so there is no remote store to reach."
          : "The server reports no object store to check, which does not match the backend above — re-check the storage configuration."}
      </p>
    );
  }
  if (component.status !== "ok") {
    return (
      <p role="alert" className="text-[13px] text-danger">
        {component.error ||
          "The object store did not answer. Uploads and playback that miss the cache will fail until it does."}
      </p>
    );
  }
  return null;
}

function MigrationCard({ campaign }: { campaign: StorageMigration }) {
  const { objects_total: total, objects_done: done } = campaign;
  const percent = total > 0 ? (done / total) * 100 : 0;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold tracking-tight">Storage migration</h3>
        <Badge variant={MIGRATION_STATE_VARIANT[campaign.state]} status>
          {MIGRATION_STATE_LABEL[campaign.state]}
        </Badge>
      </div>
      {/* Store IDENTITY strings, never credentials — "s3://<endpoint>/<bucket>"
          or "local:<path>". They are what the api compares its own backends
          against, so showing them verbatim is what makes a half-done cutover
          legible. */}
      <p className="font-mono text-[13px] break-all text-fg-muted">
        {campaign.source_desc} → {campaign.target_desc}
      </p>
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2 text-xs text-fg-muted">
          <span>
            {total > 0
              ? `${done.toLocaleString()} of ${total.toLocaleString()} objects verified`
              : "Counting objects in the source"}
          </span>
          {total > 0 ? (
            <span className="tabular-nums">{Math.round(percent)}%</span>
          ) : null}
        </div>
        <ProgressBar value={percent} label="Storage migration progress" />
      </div>
      {campaign.objects_failed > 0 ? (
        <p className="text-[13px] text-danger">
          {campaign.objects_failed.toLocaleString()} object
          {campaign.objects_failed === 1 ? "" : "s"} dead-lettered. They do not
          block the campaign, but their bytes are not in the destination.
        </p>
      ) : null}
      {campaign.last_error ? (
        <p className="text-[13px] text-warning">{campaign.last_error}</p>
      ) : null}
      <p className="text-[13px] text-fg-muted">
        Starting, cancelling and cutting over are operator actions from the
        host — see &ldquo;Moving the media store&rdquo; in the operations guide.{" "}
        <Link
          href="/admin/jobs"
          className="font-medium text-accent hover:underline"
        >
          Follow the per-object queue in Jobs
        </Link>
      </p>
    </Card>
  );
}

/**
 * Graceful discovery: shown only on a local-disk deployment that has never run
 * a campaign. It sells nothing and repeats no variable names — the Object
 * storage row in the feature list below already carries those. What it adds is
 * the half an operator cannot see from a config key: that moving later is a
 * verified, non-destructive, zero-downtime path, because "will this strand my
 * library" is the actual reason local installs never move.
 */
function ObjectStorageDiscoveryCard() {
  return (
    <Card className="flex flex-col gap-2 text-sm text-fg-muted">
      <h3 className="text-sm font-bold tracking-tight text-fg">
        Media is on this server&rsquo;s disk
      </h3>
      <p>
        That is a supported deployment, and nothing here is broken. It does mean
        the library is capped by this host&rsquo;s volume and is only as durable
        as that volume&rsquo;s own backups. Object storage moves both to the
        provider: replicated bytes, and room to grow without resizing the
        machine.
      </p>
      <p>
        Moving later is a supported path, not a rebuild. A migration campaign
        copies every object into the destination, proves each copy by reading it
        back and re-hashing it there, and only deletes the originals after a
        grace period you set — the API reads from both stores while it runs, so
        viewers notice nothing. The steps are in &ldquo;Moving the media
        store&rdquo; in the operations guide; the settings to switch are on the
        Object storage row below.
      </p>
    </Card>
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
  // Named exactly as the toggle it links to on the Advanced config page, so an
  // operator who clicks through lands on a control carrying the word they read.
  cdn: "CDN delivery",
  // "DRM" alone humanizes to the same three letters, so the fallback would look
  // deliberate while saying nothing. The suffix is what tells an operator which
  // of the several things called DRM this row is about.
  drm: "DRM content protection",
  tracing: "Distributed tracing",
  metrics: "Prometheus metrics",
  vp9_alternates: "VP9 alternate renditions",
};

/**
 * Where an operator goes to act on a feature. Deliberately partial: a link that
 * lands on a page without the promised control is worse than no link at all —
 * the operator hunts for a switch that was never there. The remaining boot-env
 * features (ATProto, malware scanning, DRM, tracing, metrics, VP9) still have
 * nowhere to send anyone: DRM in particular is DRM_PROVIDER plus DRM_KEY_KEK
 * and nothing else, so its row stays linkless until an admin control exists.
 *
 * Keyed on the server's stable feature vocabulary, so this mapping is the
 * client's to own (the contract fixes the keys, not the destinations).
 */
const FEATURE_CONFIG_PAGE: Record<string, string> = {
  // The probe below sends to the contact address, which lives on General.
  mail: "/admin/config/general",
  // Object storage has no runtime switch and never will — it is a boot-env
  // decision. It earns a link anyway because this page now reports the live
  // store: reachability, and any migration in flight. Sending the operator
  // here is sending them to state, not to a control that does not exist.
  object_storage: "/admin/infrastructure",
  // Deliberately WITHOUT the #config-section-search anchor the Advanced page
  // exposes: e2e/admin-infrastructure.spec.ts pins this link's exact href, and
  // e2e specs are never edited to make a change fit. Follow-up: add the anchor
  // and update the spec together.
  search: "/admin/config/advanced",
  federation: "/admin/config/federation",
  captions: "/admin/config/vod",
  live: "/admin/config/live",
  ipfs: "/admin/config/ipfs",
  // The one half of this row that IS a runtime switch: delivery_cdn_enabled,
  // in the Delivery section of Advanced. The other half (DELIVERY_CDN_BASE_URL)
  // is boot config, which is exactly why the row can report a switch turned on
  // with no edge behind it — and why the link still earns its place: that
  // operator's next move is to turn the switch back off. The anchor is the
  // Advanced page's own sectionAnchorId for its Delivery section, so the
  // operator lands on the toggle instead of the top of a long form.
  cdn: "/admin/config/advanced#config-section-delivery",
};

/**
 * Overrides for the link's own wording. Every other destination is a settings
 * form, so "Open settings" is accurate; object storage's destination is this
 * page's own Storage panel, and calling that "settings" would promise a form
 * that is not there.
 */
const FEATURE_CONFIG_LINK_LABEL: Record<string, string> = {
  object_storage: "See the media store above",
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

/**
 * The lead sentence of a note and everything after it. The split is the first
 * sentence terminator followed by whitespace, so a one-sentence note comes
 * back with an empty rest and never grows a disclosure it cannot fill.
 */
function splitLeadSentence(text: string): [string, string] {
  const m = /^(.*?[.!?])\s+(\S[\s\S]*)$/.exec(text);
  return m ? [m[1], m[2]] : [text, ""];
}

function FeatureRow({ feature }: { feature: InfrastructureFeature }) {
  const { enabled, configured } = feature;
  // Three states, because two booleans that disagree are the interesting case:
  // an operator who turned something on and never finished wiring it up gets a
  // warning, not a green pill that lies to them.
  const variant = !enabled ? "neutral" : configured ? "success" : "warning";
  const label = !enabled ? "Off" : configured ? "Active" : "Needs setup";
  const href = FEATURE_CONFIG_PAGE[feature.key];
  // The link renders whenever the key has a destination, independent of the
  // note: a fully Active cdn row — the one whose Enabled half IS a runtime
  // toggle — previously had no path to its control, because the link only
  // existed inside the note conditional and a healthy row carries no note.
  const link = href ? (
    <Link href={href} className="font-medium text-accent hover:underline">
      {FEATURE_CONFIG_LINK_LABEL[feature.key] ?? "Open settings"}
    </Link>
  ) : null;

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
          prefixed "Optional" and collapsed to its lead sentence: with the
          default install every row is Off and full paragraphs stack into a
          wall of text. For one that is ON but unconfigured the note is a
          finding: mail that cannot deliver is not an optional extra, and a
          warning earns all its space. */}
      {feature.note ? (
        enabled ? (
          <p className="text-[13px] text-fg-muted">
            {feature.note}
            {link ? <> {link}</> : null}
          </p>
        ) : (
          <OffNote note={feature.note} link={link} />
        )
      ) : link ? (
        <p className="text-[13px]">{link}</p>
      ) : null}
    </li>
  );
}

/**
 * Discovery copy for a switched-off feature, collapsed to its first sentence
 * behind a "More" disclosure. The settings link stays OUTSIDE the disclosure:
 * folding it into the collapsed body would recreate the unreachable-control
 * problem the link-always change just fixed.
 */
function OffNote({
  note,
  link,
}: {
  note: string;
  link: React.ReactNode | null;
}) {
  const [lead, rest] = splitLeadSentence(note);

  if (!rest) {
    // One sentence: nothing to disclose, keep the plain paragraph.
    return (
      <p className="text-[13px] text-fg-muted">
        Optional: {note}
        {link ? <> {link}</> : null}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1 text-[13px] text-fg-muted">
      <details className="group">
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          Optional: {lead}{" "}
          {/* The affordance disappears once the rest is showing. */}
          <span className="font-medium text-accent group-open:hidden">
            More
          </span>
        </summary>
        <p className="mt-1">{rest}</p>
      </details>
      {link ? <p>{link}</p> : null}
    </div>
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
  footer,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  // Live state that belongs to this panel but cannot live in the definition
  // list — anything carrying its own badge, button or card. Rendered inside the
  // same landmark so it reads (and is queried) as part of the panel.
  footer?: React.ReactNode;
}) {
  return (
    <section aria-label={title}>
      <h2 className="text-[15px] font-bold tracking-tight">{title}</h2>
      <p className="mb-2 text-[13px] text-fg-muted">{description}</p>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        {children}
      </dl>
      {footer}
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

/**
 * A second count as the environment spells it: "1h", "5m", "1m 30s". These
 * knobs are set as durations (DB_CONN_MAX_LIFETIME=1h) and reported as seconds,
 * so rendering 3600 verbatim asks the reader to divide before they can compare
 * the page against their own config.
 *
 * Not `formatUptime`: that one rounds to whole minutes, which is right for a
 * process that has been up for days and wrong here — a 15-second drain delay
 * would render as "0m", the exact value an operator would then go "fix".
 */
function humanSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0s";
  let rest = Math.floor(seconds);
  const hours = Math.floor(rest / 3600);
  rest %= 3600;
  const mins = Math.floor(rest / 60);
  rest %= 60;
  const parts: string[] = [];
  if (hours) parts.push(`${hours}h`);
  if (mins) parts.push(`${mins}m`);
  // The remainder is kept whenever it is non-zero, so a value that does not
  // divide evenly is never silently rounded into one that does.
  if (rest || parts.length === 0) parts.push(`${rest}s`);
  return parts.join(" ");
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
