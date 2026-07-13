"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  BlueskyIcon,
  ExternalLinkIcon,
  GlobeIcon,
  InfoIcon,
  MastodonIcon,
  ServerIcon,
  ShieldIcon,
  UsersIcon,
  VideoIcon,
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
import { brandingAssetUrl } from "@/lib/branding";
import type { InstanceBrandingBlock } from "@/lib/instance-config.server";

export type InstanceAboutSection =
  | "home"
  | "team"
  | "moderation"
  | "technical"
  | "vidra"
  | "network";

const PLATFORM_SECTIONS: Array<{
  id: Extract<InstanceAboutSection, "home" | "team" | "moderation" | "technical">;
  label: string;
  href: string;
}> = [
  { id: "home", label: "General", href: "/about/instance/home" },
  { id: "team", label: "Team", href: "/about/instance/team" },
  {
    id: "moderation",
    label: "Moderation and code of conduct",
    href: "/about/instance/moderation",
  },
  { id: "technical", label: "Technical information", href: "/about/instance/tech" },
];

const INSTANCE_SECTIONS = new Set<InstanceAboutSection>([
  "home",
  "team",
  "moderation",
  "technical",
]);

// PeerTube-style About surface with route-backed sections. The identity hero
// and primary tabs are shared by every section; only the content panel changes,
// keeping long operator documents out of one unbounded page.
export function InstanceAboutView({ section }: { section: InstanceAboutSection }) {
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
      .then((next) => {
        if (!cancelled) setConfig(next);
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
          setReloadKey((key) => key + 1);
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
  const branding = (instance as { branding?: InstanceBrandingBlock }).branding;
  const bannerUrl = brandingAssetUrl(branding?.banner);
  // PeerTube treats the instance avatar as its compact identity. If an older
  // backend/operator only populated a typed square logo or favicon, use that
  // as a graceful About-page fallback instead of leaving an empty identity.
  const avatarUrl =
    brandingAssetUrl(branding?.avatar) ??
    brandingAssetUrl(branding?.logos?.header_square) ??
    brandingAssetUrl(branding?.logos?.favicon);

  const categoryBadges = (instance.categories ?? []).map((id) => ({
    id,
    label: resolveOptionLabel(config?.categories, id),
  }));
  const languageBadges = (instance.moderator_languages ?? []).map((id) => ({
    id,
    label: resolveOptionLabel(config?.languages, id),
  }));
  const social = instance.social_links;
  const socialLinks = [
    { label: "Website", href: social?.website ?? "", Icon: GlobeIcon },
    { label: "Mastodon", href: social?.mastodon ?? "", Icon: MastodonIcon },
    { label: "X", href: social?.x ?? "", Icon: XIcon },
    { label: "Bluesky", href: social?.bluesky ?? "", Icon: BlueskyIcon },
  ].filter((link) => link.href !== "");

  const platformSection = INSTANCE_SECTIONS.has(section);

  return (
    <div className="flex min-w-0 flex-col gap-7">
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-fg sm:text-3xl">
        <InfoIcon size={24} />
        About
      </h1>

      <InstanceIdentityHero
        name={name}
        description={instance.short_description}
        bannerUrl={bannerUrl}
        avatarUrl={avatarUrl}
        federationEnabled={instance.federation_enabled}
        contactEnabled={instance.contact_form_enabled}
        supportEnabled={about.support_text !== ""}
        onContact={() => setContactOpen(true)}
        onSupport={() => setSupportOpen(true)}
      />

      <div className="min-w-0">
        <nav
          aria-label="About categories"
          className="flex gap-6 overflow-x-auto border-b border-border px-1"
        >
          <AboutPrimaryLink
            href="/about/instance/home"
            label="Platform"
            active={platformSection}
          />
          <AboutPrimaryLink href="/about/vidra" label="Vidra" active={section === "vidra"} />
          <AboutPrimaryLink
            href="/about/network"
            label="Network"
            active={section === "network"}
          />
        </nav>

        {platformSection ? (
          <nav
            aria-label="Platform information"
            className="mt-4 flex gap-2 overflow-x-auto pb-1"
          >
            {PLATFORM_SECTIONS.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                aria-current={section === item.id ? "page" : undefined}
                className={`focus-ring shrink-0 rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                  section === item.id
                    ? "bg-surface-strong text-fg"
                    : "text-fg-muted hover:bg-surface-muted hover:text-fg"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>

      <div className="min-w-0 pb-10">
        {section === "home" ? (
          <GeneralSection
            instance={instance}
            about={about}
            categoryBadges={categoryBadges}
            languageBadges={languageBadges}
            socialLinks={socialLinks}
          />
        ) : null}
        {section === "team" ? <TeamSection name={name} about={about} /> : null}
        {section === "moderation" ? <ModerationSection about={about} /> : null}
        {section === "technical" ? (
          <TechnicalSection instance={instance} about={about} />
        ) : null}
        {section === "vidra" ? <VidraSection instance={instance} /> : null}
        {section === "network" ? <NetworkSection instance={instance} /> : null}
      </div>

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

function InstanceIdentityHero({
  name,
  description,
  bannerUrl,
  avatarUrl,
  federationEnabled,
  contactEnabled,
  supportEnabled,
  onContact,
  onSupport,
}: {
  name: string;
  description: string;
  bannerUrl: string | null;
  avatarUrl: string | null;
  federationEnabled: boolean;
  contactEnabled: boolean;
  supportEnabled: boolean;
  onContact: () => void;
  onSupport: () => void;
}) {
  return (
    <section
      aria-label={`${name} identity`}
      className="overflow-hidden rounded-[26px] border border-border-subtle bg-surface-muted"
    >
      {bannerUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- operator-uploaded instance branding
        <img
          src={bannerUrl}
          alt={`${name} banner`}
          className="h-40 w-full bg-surface-strong object-cover sm:h-56 lg:h-64"
        />
      ) : (
        <div aria-hidden className="h-20 bg-surface-strong sm:h-28" />
      )}
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
        <div className="flex min-w-0 items-center gap-4">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- operator-uploaded instance branding
            <img
              src={avatarUrl}
              alt={`${name} icon`}
              className="h-16 w-16 shrink-0 rounded-2xl border border-border bg-surface object-cover shadow-sm sm:h-20 sm:w-20"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface text-fg-muted sm:h-20 sm:w-20">
              <VideoIcon size={30} />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="break-words text-2xl font-bold tracking-tight text-fg sm:text-3xl">
                {name}
              </h2>
              <ProtocolBadge protocol={federationEnabled ? "activitypub" : "local"} />
            </div>
            {description ? (
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-fg-muted sm:text-base">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {contactEnabled || supportEnabled ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            {contactEnabled ? (
              <Button type="button" onClick={onContact}>
                Contact us
              </Button>
            ) : null}
            {supportEnabled ? (
              <Button type="button" variant="tonal" onClick={onSupport}>
                Support
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function AboutPrimaryLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`focus-ring relative shrink-0 px-1 pb-3 text-sm font-bold transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full ${
        active
          ? "text-fg after:bg-accent"
          : "text-fg-muted after:bg-transparent hover:text-fg"
      }`}
    >
      {label}
    </Link>
  );
}

type TaxonomyBadge = { id: string; label: string };
type SocialLink = {
  label: string;
  href: string;
  Icon: typeof GlobeIcon;
};

function GeneralSection({
  instance,
  about,
  categoryBadges,
  languageBadges,
  socialLinks,
}: {
  instance: ExtendedInstanceResponse;
  about: InstanceAboutResponse;
  categoryBadges: TaxonomyBadge[];
  languageBadges: TaxonomyBadge[];
  socialLinks: SocialLink[];
}) {
  const hasTermsBlock = Boolean(about.terms || instance.terms_url || instance.privacy_url);

  return (
    <section aria-labelledby="about-general-heading" className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="flex min-w-0 flex-col gap-7">
        <div>
          <h2 id="about-general-heading" className="text-xl font-bold tracking-tight text-fg">
            General
          </h2>
          {about.description ? (
            <Markdown className="mt-3">{about.description}</Markdown>
          ) : (
            <p className="mt-2 text-sm text-fg-muted">
              The instance operator has not added a longer description yet.
            </p>
          )}
        </div>

        {hasTermsBlock ? (
          <div className="flex flex-col gap-3 border-t border-border-subtle pt-6">
            <h2 className="text-lg font-bold tracking-tight text-fg">Terms</h2>
            {about.terms ? <Markdown>{about.terms}</Markdown> : null}
            {instance.terms_url || instance.privacy_url ? (
              <ul className="flex flex-col gap-2 text-sm">
                {instance.terms_url ? (
                  <li>
                    <ExternalDocumentLink href={instance.terms_url} label="Terms of service" />
                  </li>
                ) : null}
                {instance.privacy_url ? (
                  <li>
                    <ExternalDocumentLink href={instance.privacy_url} label="Privacy policy" />
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      <aside className="flex h-fit flex-col gap-5 rounded-2xl bg-surface-muted p-5">
        <div>
          <h3 className="text-sm font-bold text-fg">Instance specifics</h3>
          <dl className="mt-3 flex flex-col gap-3 text-sm">
            <SpecificRow
              label="Registration"
              value={
                instance.registration_enabled
                  ? instance.registration_requires_approval
                    ? "Approval required"
                    : "Open"
                  : "Closed"
              }
            />
            {instance.server_country ? (
              <SpecificRow label="Server country" value={instance.server_country} />
            ) : null}
            <SpecificRow
              label="Federation"
              value={instance.federation_enabled ? "ActivityPub" : "Local only"}
            />
          </dl>
        </div>

        {categoryBadges.length > 0 || languageBadges.length > 0 ? (
          <div>
            <h3 className="text-sm font-bold text-fg">Topics and languages</h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {categoryBadges.map((badge) => (
                <Badge key={`category-${badge.id}`} variant="neutral">
                  {badge.label}
                </Badge>
              ))}
              {languageBadges.map((badge) => (
                <Badge key={`language-${badge.id}`} variant="strong">
                  {badge.label}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        {instance.is_sensitive ? (
          <p className="rounded-xl bg-warning/15 px-3 py-2 text-[13px] font-medium text-warning">
            {instance.name} is dedicated to sensitive content.
          </p>
        ) : null}

        {instance.contact_email ? (
          <div>
            <h3 className="text-sm font-bold text-fg">Administrator email</h3>
            <a
              href={`mailto:${instance.contact_email}`}
              className="focus-ring mt-1 block break-all rounded-sm text-sm font-semibold text-fg underline underline-offset-2"
            >
              {instance.contact_email}
            </a>
          </div>
        ) : null}

        {socialLinks.length > 0 ? (
          <div>
            <h3 className="text-sm font-bold text-fg">Find us elsewhere</h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {socialLinks.map(({ label, href, Icon }) => (
                <li key={label}>
                  <a
                    href={href}
                    target="_blank"
                    rel="me noopener noreferrer"
                    className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-[13px] font-semibold text-fg-muted transition-colors hover:bg-surface-strong hover:text-fg"
                  >
                    <Icon size={15} />
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </aside>
    </section>
  );
}

function TeamSection({ name, about }: { name: string; about: InstanceAboutResponse }) {
  const hasContent = Boolean(
    about.administrator_info ||
      about.creation_reason ||
      about.maintenance_lifetime ||
      about.business_model,
  );
  return (
    <section aria-labelledby="about-team-heading" className="flex max-w-4xl flex-col gap-6">
      <h2 id="about-team-heading" className="text-xl font-bold tracking-tight text-fg">
        Team
      </h2>
      {hasContent ? (
        <>
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
        </>
      ) : (
        <EmptyAboutCopy>Team information has not been published yet.</EmptyAboutCopy>
      )}
    </section>
  );
}

function ModerationSection({ about }: { about: InstanceAboutResponse }) {
  const hasContent = Boolean(about.moderation_info || about.code_of_conduct);
  return (
    <section aria-labelledby="about-moderation-heading" className="flex max-w-4xl flex-col gap-7">
      <h2 id="about-moderation-heading" className="text-xl font-bold tracking-tight text-fg">
        Moderation and code of conduct
      </h2>
      {hasContent ? (
        <>
          <AboutBlock title="Moderation information" text={about.moderation_info} />
          <AboutBlock title="Code of conduct" text={about.code_of_conduct} />
        </>
      ) : (
        <EmptyAboutCopy>Moderation information has not been published yet.</EmptyAboutCopy>
      )}
    </section>
  );
}

function TechnicalSection({
  instance,
  about,
}: {
  instance: ExtendedInstanceResponse;
  about: InstanceAboutResponse;
}) {
  return (
    <section aria-labelledby="about-technical-heading" className="flex max-w-5xl flex-col gap-7">
      <h2 id="about-technical-heading" className="text-xl font-bold tracking-tight text-fg">
        Technical information
      </h2>
      <AboutBlock title="Server and hardware" text={about.hardware_info} />
      <div className="overflow-hidden rounded-2xl border border-border-subtle">
        <dl className="divide-y divide-border-subtle text-sm">
          <TechnicalRow
            label="Software"
            value={`${instance.software.name} v${instance.software.version}`}
          />
          <TechnicalRow
            label="Federation"
            value={instance.federation_enabled ? "ActivityPub enabled" : "Local only"}
          />
          <TechnicalRow label="Video uploads" value={enabledLabel(instance.features.uploads)} />
          <TechnicalRow label="URL imports" value={enabledLabel(instance.features.imports)} />
          <TechnicalRow label="Live streaming" value={enabledLabel(instance.features.live)} />
          <TechnicalRow label="Comments" value={enabledLabel(instance.features.comments)} />
          <TechnicalRow
            label="Registration"
            value={instance.registration_enabled ? "Enabled" : "Disabled"}
          />
        </dl>
      </div>
    </section>
  );
}

function VidraSection({ instance }: { instance: ExtendedInstanceResponse }) {
  return (
    <section aria-labelledby="about-vidra-heading" className="flex flex-col gap-7">
      <div className="mx-auto max-w-3xl text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-muted text-fg">
          <VideoIcon size={32} />
        </div>
        <h2 id="about-vidra-heading" className="mt-4 text-2xl font-bold tracking-tight text-fg">
          This platform is powered by Vidra
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-fg-muted sm:text-base">
          Vidra is self-hosted video software: this instance is operated independently and sets
          its own community, registration, publishing, and moderation policies.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <AboutFeatureCard
          Icon={ServerIcon}
          title="Independently hosted"
          copy="The instance operator controls its infrastructure, branding, policies, and community data."
        />
        <AboutFeatureCard
          Icon={GlobeIcon}
          title={instance.federation_enabled ? "Federated by ActivityPub" : "Local by choice"}
          copy={
            instance.federation_enabled
              ? "Public channels and videos can participate in the wider Fediverse."
              : "This operator has chosen to keep publishing and discovery on this server."
          }
        />
        <AboutFeatureCard
          Icon={VideoIcon}
          title="Built for video"
          copy="Channels, uploads, live video, captions, playlists, and community interaction live in one place."
        />
      </div>
    </section>
  );
}

function NetworkSection({ instance }: { instance: ExtendedInstanceResponse }) {
  return (
    <section aria-labelledby="about-network-heading" className="flex flex-col gap-6">
      <div>
        <h2 id="about-network-heading" className="text-xl font-bold tracking-tight text-fg">
          Network
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-fg-muted">
          {instance.federation_enabled
            ? `${instance.name} connects to compatible services through ActivityPub.`
            : `${instance.name} currently operates as a local-only video platform.`}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <AboutFeatureCard
          Icon={GlobeIcon}
          title={instance.federation_enabled ? "Federation enabled" : "Federation disabled"}
          copy={
            instance.federation_enabled
              ? "Public content can reach compatible Fediverse software, and remote content can appear on this instance when its policies allow it."
              : "Content stays on this server and remote ActivityPub discovery is unavailable."
          }
        />
        <AboutFeatureCard
          Icon={UsersIcon}
          title="Channel-level relationships"
          copy="Vidra federates individual channels rather than exposing one instance-wide follower graph. Followers and remote relationships therefore belong to channel pages."
        />
        <AboutFeatureCard
          Icon={ShieldIcon}
          title="Local moderation remains in control"
          copy="The operator can block remote instances and apply local community rules even while federation is enabled."
        />
        <AboutFeatureCard
          Icon={ServerIcon}
          title="Independent instance"
          copy={`${instance.name} owns its availability, registration policy, data, and publishing defaults.`}
        />
      </div>
    </section>
  );
}

function AboutFeatureCard({
  Icon,
  title,
  copy,
}: {
  Icon: typeof GlobeIcon;
  title: string;
  copy: string;
}) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-muted p-5">
      <Icon size={24} className="text-fg-muted" />
      <h3 className="mt-4 text-base font-bold tracking-tight text-fg">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-fg-muted">{copy}</p>
    </div>
  );
}

function AboutBlock({ title, text }: { title: string; text: string }) {
  if (!text) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[15px] font-bold tracking-tight text-fg">{title}</h3>
      <Markdown>{text}</Markdown>
    </div>
  );
}

function EmptyAboutCopy({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-border bg-surface-muted px-5 py-8 text-center text-sm text-fg-muted">
      {children}
    </p>
  );
}

function ExternalDocumentLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="focus-ring inline-flex items-center gap-1.5 rounded-sm font-semibold text-fg underline underline-offset-2"
    >
      {label}
      <ExternalLinkIcon size={14} />
    </a>
  );
}

function SpecificRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="text-right font-semibold text-fg">{value}</dd>
    </div>
  );
}

function TechnicalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(12rem,0.55fr)_1fr] sm:items-center sm:px-5">
      <dt className="font-semibold text-fg">{label}</dt>
      <dd className="text-fg-muted">{value}</dd>
    </div>
  );
}

function enabledLabel(enabled: boolean): string {
  return enabled ? "Enabled" : "Disabled";
}
