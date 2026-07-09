"use client";

import { useEffect, useState } from "react";

import {
  BlueskyIcon,
  ExternalLinkIcon,
  GlobeIcon,
  MastodonIcon,
  XIcon,
} from "@/components/icons";
import { InstanceContactModal } from "@/components/InstanceContactModal";
import { Markdown } from "@/components/Markdown";
import { ProtocolBadge } from "@/components/ProtocolBadge";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import {
  EMPTY_INSTANCE_ABOUT,
  api,
  getInstanceAbout,
  getVideoConfigCached,
  resolveOptionLabel,
} from "@/lib/api";
import type {
  ExtendedInstanceResponse,
  InstanceAboutResponse,
  VideoConfigResponse,
} from "@/lib/api";

// InstanceAboutView is the /about surface, rebuilt to the PeerTube structure
// (spec: instance-platform-info.md): a sub-nav over four sections —
//   General    — name + short description, Contact/Support actions, category
//                and language badges, the sensitive-content notice, the long
//                Description and Terms (markdown), server country, social links;
//   Team       — the four "you and your platform" answers;
//   Moderation — moderation information + code of conduct;
//   Technical  — hardware info, software version, features, federation status.
// A section whose fields are ALL empty is hidden (and leaves the sub-nav).
// Data: GET /instance (extended) + GET /instance/about; the about endpoint
// 404s until the backend half lands, which maps to the all-empty document.
export function InstanceAboutView() {
  const [instance, setInstance] = useState<ExtendedInstanceResponse | null>(null);
  const [about, setAbout] = useState<InstanceAboutResponse | null>(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [config, setConfig] = useState<VideoConfigResponse | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getInstance(controller.signal)
      .then((res) => setInstance(res as ExtendedInstanceResponse))
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    getInstanceAbout(controller.signal)
      .then(setAbout)
      .catch(() => {
        // 404 (backend not landed / nothing configured) or any failure: the
        // long-form texts are simply absent — never an error wall.
        if (!controller.signal.aborted) setAbout(EMPTY_INSTANCE_ABOUT);
      });
    return () => controller.abort();
  }, [reloadKey]);

  const hasTaxonomy = Boolean(
    instance &&
      ((instance.categories?.length ?? 0) > 0 || (instance.moderator_languages?.length ?? 0) > 0),
  );
  useEffect(() => {
    if (!hasTaxonomy) return;
    let cancelled = false;
    getVideoConfigCached()
      .then((c) => {
        if (!cancelled) setConfig(c);
      })
      .catch(() => {
        // Badges fall back to the raw taxonomy ids.
      });
    return () => {
      cancelled = true;
    };
  }, [hasTaxonomy]);

  if (error) {
    return (
      <ErrorState
        message="Could not load this instance's details."
        onRetry={() => {
          setError(false);
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }

  if (instance === null || about === null) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading instance details" />
      </div>
    );
  }

  const name = instance.name;
  const social = instance.social_links;
  const socialLinks = [
    { label: "Website", href: social?.website ?? "", Icon: GlobeIcon },
    { label: "Mastodon", href: social?.mastodon ?? "", Icon: MastodonIcon },
    { label: "X", href: social?.x ?? "", Icon: XIcon },
    { label: "Bluesky", href: social?.bluesky ?? "", Icon: BlueskyIcon },
  ].filter((l) => l.href !== "");

  const hasTeam = Boolean(
    about.administrator_info ||
      about.creation_reason ||
      about.maintenance_lifetime ||
      about.business_model,
  );
  const hasModeration = Boolean(about.moderation_info || about.code_of_conduct);

  const sections = [
    { id: "general", label: "General", show: true },
    { id: "team", label: "Team", show: hasTeam },
    { id: "moderation", label: "Moderation and code of conduct", show: hasModeration },
    { id: "technical", label: "Technical information", show: true },
  ].filter((s) => s.show);

  const categoryBadges = (instance.categories ?? []).map((id) => ({
    id,
    label: resolveOptionLabel(config?.categories, id),
  }));
  const languageBadges = (instance.moderator_languages ?? []).map((id) => ({
    id,
    label: resolveOptionLabel(config?.languages, id),
  }));

  const hasTermsBlock = Boolean(about.terms || instance.terms_url || instance.privacy_url);

  return (
    <div className="flex flex-col gap-8">
      <nav aria-label="About sections" className="flex flex-wrap gap-2">
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="focus-ring inline-flex rounded-full bg-surface-muted px-3.5 py-1.5 text-[13px] font-semibold text-fg-muted transition-colors hover:bg-surface-strong hover:text-fg"
          >
            {s.label}
          </a>
        ))}
      </nav>

      {/* ── General ─────────────────────────────────────────────────────── */}
      <section id="general" aria-label="General" className="flex scroll-mt-20 flex-col gap-5">
        <header className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
            <ProtocolBadge protocol={instance.federation_enabled ? "activitypub" : "local"} />
          </div>
          {instance.short_description ? (
            <p className="text-sm text-fg-muted">{instance.short_description}</p>
          ) : null}
          {(instance.contact_form_enabled || about.support_text) ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {instance.contact_form_enabled ? (
                <Button type="button" onClick={() => setContactOpen(true)}>
                  Contact
                </Button>
              ) : null}
              {about.support_text ? (
                <Button type="button" variant="tonal" onClick={() => setSupportOpen(true)}>
                  Support
                </Button>
              ) : null}
            </div>
          ) : null}
          {categoryBadges.length > 0 || languageBadges.length > 0 ? (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {categoryBadges.map((b) => (
                <Badge key={`c-${b.id}`} variant="neutral">
                  {b.label}
                </Badge>
              ))}
              {languageBadges.map((b) => (
                <Badge key={`l-${b.id}`} variant="strong">
                  {b.label}
                </Badge>
              ))}
            </div>
          ) : null}
          {instance.is_sensitive ? (
            <p className="mt-1 w-fit rounded-xl bg-warning/15 px-3 py-2 text-[13px] font-medium text-warning">
              {name} is dedicated to sensitive content.
            </p>
          ) : null}
        </header>

        {about.description ? (
          <div className="flex flex-col gap-2">
            <h2 className="text-[15px] font-bold tracking-tight text-fg">Description</h2>
            <Markdown>{about.description}</Markdown>
          </div>
        ) : null}

        {hasTermsBlock ? (
          <div className="flex flex-col gap-2">
            <h2 className="text-[15px] font-bold tracking-tight text-fg">Terms</h2>
            {about.terms ? <Markdown>{about.terms}</Markdown> : null}
            {(instance.terms_url || instance.privacy_url) ? (
              <ul className="flex flex-col gap-1 text-sm">
                {instance.terms_url ? (
                  <li>
                    <a
                      href={instance.terms_url}
                      className="focus-ring inline-flex items-center gap-1.5 rounded-sm font-semibold text-fg underline underline-offset-2"
                    >
                      Terms of service
                      <ExternalLinkIcon size={14} />
                    </a>
                  </li>
                ) : null}
                {instance.privacy_url ? (
                  <li>
                    <a
                      href={instance.privacy_url}
                      className="focus-ring inline-flex items-center gap-1.5 rounded-sm font-semibold text-fg underline underline-offset-2"
                    >
                      Privacy policy
                      <ExternalLinkIcon size={14} />
                    </a>
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-1 text-sm text-fg-muted">
          <p>
            {instance.registration_enabled
              ? instance.registration_requires_approval
                ? "Registration is open — new accounts require administrator approval."
                : "Registration is open — anyone can create an account."
              : "Registration is closed — this instance is not accepting new accounts."}
          </p>
          {instance.server_country ? <p>Server country: {instance.server_country}</p> : null}
          {instance.contact_email ? (
            <p>
              Admin email:{" "}
              <a
                href={`mailto:${instance.contact_email}`}
                className="focus-ring rounded-sm font-semibold text-fg underline underline-offset-2"
              >
                {instance.contact_email}
              </a>
            </p>
          ) : null}
        </div>

        {socialLinks.length > 0 ? (
          <ul aria-label="Find us elsewhere" className="flex flex-wrap items-center gap-2">
            {socialLinks.map(({ label, href, Icon }) => (
              <li key={label}>
                <a
                  href={href}
                  target="_blank"
                  rel="me noopener noreferrer"
                  className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-3.5 py-1.5 text-[13px] font-semibold text-fg-muted transition-colors hover:bg-surface-strong hover:text-fg"
                >
                  <Icon size={15} />
                  {label}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* ── Team ────────────────────────────────────────────────────────── */}
      {hasTeam ? (
        <section
          id="team"
          aria-label="Team"
          className="flex scroll-mt-20 flex-col gap-5 border-t border-border-subtle pt-6"
        >
          <h2 className="text-lg font-bold tracking-tight text-fg">Team</h2>
          <AboutBlock title="Who we are" text={about.administrator_info} />
          <AboutBlock title={`Why we created ${name}`} text={about.creation_reason} />
          <AboutBlock
            title={`How long we plan to maintain ${name}`}
            text={about.maintenance_lifetime}
          />
          <AboutBlock
            title={`How we will pay for keeping ${name} running`}
            text={about.business_model}
          />
        </section>
      ) : null}

      {/* ── Moderation and code of conduct ──────────────────────────────── */}
      {hasModeration ? (
        <section
          id="moderation"
          aria-label="Moderation and code of conduct"
          className="flex scroll-mt-20 flex-col gap-5 border-t border-border-subtle pt-6"
        >
          <h2 className="text-lg font-bold tracking-tight text-fg">
            Moderation and code of conduct
          </h2>
          <AboutBlock title="Moderation information" text={about.moderation_info} />
          <AboutBlock title="Code of conduct" text={about.code_of_conduct} />
        </section>
      ) : null}

      {/* ── Technical information ───────────────────────────────────────── */}
      <section
        id="technical"
        aria-label="Technical information"
        className="flex scroll-mt-20 flex-col gap-5 border-t border-border-subtle pt-6"
      >
        <h2 className="text-lg font-bold tracking-tight text-fg">Technical information</h2>
        <AboutBlock
          title="What server/hardware does the instance run on?"
          text={about.hardware_info}
        />
        <div className="flex flex-col gap-1">
          <h3 className="text-[15px] font-bold tracking-tight text-fg">Software</h3>
          <p className="text-sm text-fg-muted">
            {instance.software.name} v{instance.software.version}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-[15px] font-bold tracking-tight text-fg">Features</h3>
          <ul className="flex flex-col gap-1.5 text-sm">
            <FeatureRow label="Video uploads" enabled={instance.features.uploads} />
            <FeatureRow label="URL imports" enabled={instance.features.imports} />
            <FeatureRow label="Live streaming" enabled={instance.features.live} />
            <FeatureRow label="Comments" enabled={instance.features.comments} />
          </ul>
        </div>
        <div className="flex flex-col gap-1">
          <h3 className="text-[15px] font-bold tracking-tight text-fg">Federation</h3>
          <p className="text-sm text-fg-muted">
            {instance.federation_enabled
              ? "This instance federates over ActivityPub: public videos and channels here can be followed and watched from other instances, and remote content can appear in local feeds."
              : "This instance does not federate — everything published here stays on this server."}
          </p>
        </div>
      </section>

      {contactOpen ? (
        <InstanceContactModal instanceName={name} onClose={() => setContactOpen(false)} />
      ) : null}
      {supportOpen ? (
        <Modal title={`Support ${name}`} onClose={() => setSupportOpen(false)}>
          <div className="max-h-[70vh] overflow-y-auto">
            <Markdown>{about.support_text}</Markdown>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

// AboutBlock renders one titled markdown block, or nothing when the text is
// empty — the building brick behind the hide-when-empty section rule.
function AboutBlock({ title, text }: { title: string; text: string }) {
  if (!text) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[15px] font-bold tracking-tight text-fg">{title}</h3>
      <Markdown>{text}</Markdown>
    </div>
  );
}

function FeatureRow({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <li className="flex items-center gap-2">
      <span className="text-fg">{label}</span>
      <Badge variant={enabled ? "success" : "neutral"}>{enabled ? "Enabled" : "Disabled"}</Badge>
    </li>
  );
}
