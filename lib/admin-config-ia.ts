// Admin config information architecture (config-parity W2; waves.md
// architecture note 4). The single /admin/config page split into the
// PeerTube-mirroring multi-page IA:
//
//   general | vod | live | federation | customization | homepage | advanced
//
// This module is the client-side placement registry: which page + section
// every known setting renders on, how it is edited, validated, and disclosed.
// Placement precedence per key:
//
//   1. Server metadata — GET /admin/instance-settings rows gain optional
//      `page`/`section` fields (W1, instance-contract.md). When present they
//      WIN, so vidra-core can re-home keys without a frontend release.
//   2. This META map — the fallback while W1 lands in parallel.
//   3. Neither → the Advanced page's "Other settings" section.
//
// MIRROR RULE — client section ids MUST match the server's section ids. Server
// placement wins in placementFor(), so a curated SectionDef whose id does not
// match the server's leaves the server-placed keys stranded in an auto-titled,
// description-less section while the curated header renders empty (and gets
// culled). The authoritative section ids live in vidra-core
// internal/instancesettings/service.go (the `specs` table's `section` field);
// the ids here are their normalized slugs (normalizeSectionId: lowercased,
// non-alphanumerics → "-", so "publish_defaults" → "publish-defaults" and
// "user_data" → "user-data"). The only client-only sections are the panel
// sections (branding, homepage, custom-css, custom-js), which host non-registry
// content and legitimately have no server counterpart. There is a normalization
// precedent for this in placementFor (the publish_defaults reconciliation).
//
// The metadata-driven invariant survives the split: a key this client has
// never heard of still auto-renders — into the section the server names (an
// unknown section id becomes an auto-titled section), or into a page's
// "Other settings" fallback — so a new backend setting is never hidden.
//
// No "use client" here: server components (the config pages) read the page
// registry too.

import type { InstanceSetting } from "@/lib/api/types";
import { formatBytes } from "@/lib/format";

/** A setting's editable value: string, bool, integer (limit kinds), or (list kinds) a string array. */
export type SettingValue = string | boolean | string[] | number;

/**
 * An instance-settings row plus the W1 placement metadata, kept OPTIONAL here
 * regardless of the generated API type: the placement logic must tolerate a
 * pre-W1 backend (rows without page/section), so the fields are re-declared
 * as optional strings over whatever the codegen says.
 */
export type PlacedInstanceSetting = Omit<InstanceSetting, "page" | "section"> & {
  page?: string;
  section?: string;
};

/** The minimal /instance shape boot-dependency checks read (client fetch). */
export type InstanceBootInfo = {
  federation_enabled?: boolean;
  features?: {
    uploads?: boolean;
    imports?: boolean;
    live?: boolean;
    comments?: boolean;
    /** Outbound-mail boot capability (config-parity W6 email seam). */
    mail?: boolean;
  };
};

// --- Pages ---------------------------------------------------------------

export type ConfigPageId =
  | "general"
  | "vod"
  | "live"
  | "federation"
  | "customization"
  | "homepage"
  | "advanced";

export type ConfigPageDef = {
  id: ConfigPageId;
  label: string;
  description: string;
  /**
   * A page-wide boot-dependency note: when the /instance snapshot shows the
   * page's backing subsystem is disabled at boot, the note renders above the
   * form (the settings still render — they just will not take effect).
   */
  bootNote?: (instance: InstanceBootInfo) => string | null;
};

export const CONFIG_PAGES: readonly ConfigPageDef[] = [
  {
    id: "general",
    label: "General",
    description:
      "Platform identity, the About page, terms and moderation, sign-up, and comments.",
  },
  {
    id: "vod",
    label: "VOD",
    description: "Uploads, imports, quotas, and processing for on-demand video.",
  },
  {
    id: "live",
    label: "Live",
    description: "Live streaming availability and limits.",
  },
  {
    id: "federation",
    label: "Federation",
    description: "How this instance exchanges content with other instances.",
    bootNote: (instance) =>
      instance.federation_enabled === false
        ? "ActivityPub federation is disabled on this server (FEDERATION_ENABLED). Settings on this page have no effect until it is enabled at boot."
        : null,
  },
  {
    id: "customization",
    label: "Customization",
    description: "Theme, appearance, player defaults, and email presentation.",
  },
  {
    id: "homepage",
    label: "Homepage",
    description: "The admin-authored homepage document.",
  },
  {
    id: "advanced",
    label: "Advanced",
    description: "Search, data portability, and low-level settings.",
  },
] as const;

export function isConfigPageId(value: unknown): value is ConfigPageId {
  return typeof value === "string" && CONFIG_PAGES.some((p) => p.id === value);
}

export function configPage(id: ConfigPageId): ConfigPageDef {
  const page = CONFIG_PAGES.find((p) => p.id === id);
  if (!page) throw new Error(`unknown config page: ${id}`);
  return page;
}

// --- Sections ------------------------------------------------------------

export type SectionDef = {
  id: string;
  title: string;
  description: string;
  /**
   * This section hosts a non-registry panel (e.g. the Branding assets
   * manager) and must render even when no registry key lands in it — a
   * registry-keyed section only renders once it has keys, but a panel
   * section's content does not come from the registry at all.
   */
  alwaysRender?: boolean;
};

/** Every page's auto-render fallback section (the invariant's landing zone). */
export const OTHER_SECTION_ID = "other";

const OTHER_SECTION: SectionDef = {
  id: OTHER_SECTION_ID,
  title: "Other settings",
  description: "Additional runtime settings this admin console has no dedicated form for yet.",
};

// Known sections per page, in display order. Every non-panel section id here
// MIRRORS a server section id (the MIRROR RULE above) so a server-placed key
// lands under a properly titled, described header with zero frontend work;
// empty-today sections are pre-declared for the same reason. Panel sections
// (branding, homepage, custom-css, custom-js) are the only client-only
// sections — they host non-registry content (alwaysRender) and have no server
// counterpart.
export const PAGE_SECTIONS: Record<ConfigPageId, SectionDef[]> = {
  general: [
    {
      id: "identity",
      title: "Platform",
      description: "The public identity of this instance: name, descriptions, and classification.",
    },
    {
      // Server id "contact": the admin email + contact form (was the client-only
      // "administrators" section, which the server has no counterpart for).
      id: "contact",
      title: "Administrators & contact",
      description: "Who runs this instance and how visitors can reach them.",
    },
    {
      id: "branding",
      title: "Branding",
      description:
        "The imagery this instance presents: avatar, banner, header logos, favicon, and the social-card image.",
      // The section's content is the InstanceBrandingManager panel (dedicated
      // upload/delete endpoints, not registry keys), so it renders regardless
      // of which registry keys the server places here. Client-only panel.
      alwaysRender: true,
    },
    {
      id: "broadcast",
      title: "Broadcast message",
      description: "A site-wide announcement banner shown to every visitor.",
    },
    {
      id: "browse",
      title: "Landing & browse defaults",
      description:
        "What visitors who have not chosen anything see first: the landing surface and the feed's default sort and reach.",
    },
    {
      id: "social",
      title: "Social",
      description: "How people can follow the instance elsewhere.",
    },
    {
      // Server id "channels": per-account channel limits.
      id: "channels",
      title: "Channels",
      description: "Limits on the channels each account can create.",
    },
    {
      id: "signup",
      title: "Sign-up & new users",
      description: "Whether people can sign up, and what new accounts start with.",
    },
    {
      id: "moderation",
      title: "Moderation & sensitive content",
      description: "Rules of the house and how sensitive videos are treated.",
    },
    {
      id: "about",
      title: "About page",
      description:
        "Everything shown on the public About page: legal links, how people can support the instance, the terms and code of conduct, and your answers about who runs it.",
    },
  ],
  vod: [
    {
      id: "uploads",
      title: "Uploads",
      description:
        "Upload availability, size caps, and storage quotas. 0 means unlimited; changes apply on the next request — no restart.",
    },
    {
      id: "imports",
      title: "Imports",
      description: "Importing videos from URLs and synchronizing remote channels.",
    },
    {
      id: "transcoding",
      title: "Transcoding",
      description: "How uploaded videos are processed into streamable renditions.",
    },
    {
      id: "playback",
      title: "Playback",
      description: "Optional playback experiences available while viewers browse video cards.",
    },
    {
      // Server id "storyboards": seek-preview sprite generation.
      id: "storyboards",
      title: "Storyboards",
      description: "Seek-preview thumbnail sprites generated when a video publishes.",
    },
    {
      // Server id "transcription": Whisper auto-captions.
      id: "transcription",
      title: "Transcription",
      description: "Automatic caption generation for uploaded videos (needs a transcription backend).",
    },
    {
      // Server id "comments": vidra-core homes the comments toggle on VOD, not
      // General (the MIRROR RULE — do not re-home it under General).
      id: "comments",
      title: "Comments",
      description: "Whether viewers can discuss videos on this instance.",
    },
    {
      id: "downloads",
      title: "Downloads",
      description: "Whether viewers can save video files from this instance.",
    },
    {
      // Matches the server metadata's `publish_defaults` section id
      // (normalized to "publish-defaults") so the W9 keys land here.
      id: "publish-defaults",
      title: "Publish defaults",
      description: "What a new video starts with before its creator changes anything.",
    },
  ],
  live: [
    {
      // Server id "streaming": the master live toggle.
      id: "streaming",
      title: "Live streaming",
      description: "Whether creators can go live.",
    },
    {
      // Server id "replay": recording live streams into videos.
      id: "replay",
      title: "Replay",
      description: "Whether live streams can be recorded and kept as videos afterwards.",
    },
    {
      // Server id "limits": caps on concurrency and duration.
      id: "limits",
      title: "Limits",
      description: "Caps on how many live streams run at once and how long a stream may run.",
    },
  ],
  federation: [
    {
      // Server id "comments": inbound remote comments.
      id: "comments",
      title: "Remote comments",
      description: "Comments federated in from other instances over ActivityPub.",
    },
    {
      // Server id "followers": how inbound channel-follow requests are answered.
      id: "followers",
      title: "Followers",
      description: "How this instance answers remote follow requests for its channels.",
    },
    {
      // Server id "search": remote-URI search resolution (W13).
      id: "search",
      title: "Remote search",
      description:
        "Whether a URL- or handle-shaped search query resolves remote content through federation.",
    },
  ],
  customization: [
    {
      id: "theme",
      title: "Theme",
      description: "The default appearance for visitors who have not picked their own.",
    },
    {
      id: "header",
      title: "Header",
      description: "How the site header presents this instance.",
    },
    {
      id: "player",
      title: "Player",
      description: "How the video player behaves before a viewer changes anything.",
    },
    {
      id: "email",
      title: "Email",
      description: "How outgoing mail from this instance is presented.",
    },
  ],
  homepage: [
    {
      id: "homepage",
      title: "Homepage document",
      description:
        "An admin-authored page visitors can land on instead of the video feed. Saving a non-empty document unlocks the “Homepage document” landing option (General → Landing & browse defaults).",
      // Config-parity W6: the section's content is the homepage document
      // editor panel (the W1 document store, not a registry key). Client-only panel.
      alwaysRender: true,
    },
  ],
  advanced: [
    // Config-parity W6: the custom CSS/JS document editors (architecture
    // note 6's security posture — CSS first, JS danger-styled behind a typed
    // confirmation). Client-only panel sections over the W1 document store, not
    // registry keys.
    {
      id: "custom-css",
      title: "Custom CSS",
      description:
        "A stylesheet injected into every page, applied on top of the built-in styles.",
      alwaysRender: true,
    },
    {
      id: "custom-js",
      title: "Custom JavaScript",
      description:
        "A script injected into every page. It runs in every visitor's browser — treat it like deploying code.",
      alwaysRender: true,
    },
    {
      // Server id "search" (search-service W4): the ranking family plus the
      // instance-half personalization / history / suggestion gates and the event
      // retention / suggestion-threshold limits. Mirrors the server section id.
      // (Distinct from the Federation page's own "search" section, which governs
      // W13 remote-URI resolution — sections are scoped per page.)
      id: "search",
      title: "Search & recommendations",
      description:
        "How search ranks and what discovery learns: the ranking family, the instance-level personalization, suggestion, and history gates, and how long behavioural events are kept.",
    },
    {
      // Server id "user_data" (normalized to "user-data"): the account
      // import/export controls. (The W13 remote-search keys the client once
      // stubbed here live on the Federation page — vidra-core homes them there.)
      id: "user-data",
      title: "User data portability",
      description: "Letting people take their account data with them, and the limits on exports.",
    },
  ],
};

/** "channel-sync" → "Channel sync" — the title for a server-invented section. */
export function humanizeSectionId(id: string): string {
  const words = id.replace(/[-_]+/g, " ").trim();
  return words === "" ? "Settings" : words.charAt(0).toUpperCase() + words.slice(1);
}

// --- Controls & validation ------------------------------------------------

// How a setting is edited. Drives the control rendered per row; the server's
// `type` stays the validation truth, presentation lives here.
export type ControlKind =
  | "text"
  | "textarea"
  | "markdown" // Textarea + markdown Preview modal
  | "toggle"
  | "language-select"
  | "country-select"
  | "category-multi"
  | "language-multi"
  | "policy-segmented"
  | "level-segmented" // SegmentedControl over info|warning|error (broadcast)
  | "enum-segmented" // SegmentedControl over the key's META `options` (W5 enum keys)
  | "number" // bounded integer input (limit keys)
  | "bytes" // like number, with a human-readable size hint
  | "color" // hex input + swatch + live WCAG contrast warnings (W6 primary color)
  | "list"; // editable string-array (token chips + free-text add); optional suggestions via META options

/**
 * The federation protocol a setting's gate governs, surfaced as a ProtocolBadge
 * on the row. Deliberately narrow: every registered federation gate is
 * ActivityPub-side (the inbox — internal/federation/inbox.go), and vidra's
 * ATProto integration is outbound-only with no inbound gate, so there is no
 * ATProto/local member to mislabel. Extend only when a gate for another
 * protocol actually ships.
 */
export type SettingProtocol = "activitypub";

/** One choice of an enum-segmented control: the wire value + its picker label. */
export type EnumOption = { value: string; label: string };

/** Immediate inline validation: null = fine, string = the inline error. */
export type SettingValidator = (value: SettingValue) => string | null;

/** "" is fine (unset); anything else must be a #rrggbb hex color. */
export function validateHexColor(value: SettingValue): string | null {
  if (typeof value !== "string" || value === "") return null;
  return /^#[0-9a-fA-F]{6}$/.test(value) ? null : "Enter a 6-digit hex color, like #7c5cff.";
}

/**
 * "" is fine (unset); anything else must be an X/Twitter handle — an optional
 * leading @ plus 1–15 word characters (mirrors the backend validator for
 * social_meta_twitter_username).
 */
export function validateTwitterHandle(value: SettingValue): string | null {
  if (typeof value !== "string" || value === "") return null;
  return /^@?[A-Za-z0-9_]{1,15}$/.test(value)
    ? null
    : "Enter a handle like @vidra: up to 15 letters, digits, or underscores.";
}

/** 0 = unlimited (the vidra convention — never -1); otherwise min..max. */
export function zeroOrIntRange(
  min: number,
  max: number | null,
  message: string,
): SettingValidator {
  return (value) => {
    if (typeof value !== "number" || value === 0) return null;
    if (value < min || (max !== null && value > max)) return message;
    return null;
  };
}

/** A required integer in [min, max] (no 0=unlimited sentinel — concurrency knobs). */
export function intRange(min: number, max: number, message: string): SettingValidator {
  return (value) => {
    if (typeof value !== "number") return null; // non-numbers are the server's problem
    return value < min || value > max ? message : null;
  };
}

// The canonical HLS ladder rung heights an admin may enable, mirroring
// vidra-core media.HLSCanonicalRungHeights (highest first). The server does NOT
// expose these through the setting's `options` (that field is enum-only), so
// the client carries the suggestion set; the server's validator stays the truth
// (an unknown rung 422s). The shipped default ladder is a subset (1080–360p).
export const TRANSCODING_RUNG_OPTIONS: readonly EnumOption[] = [
  { value: "2160", label: "2160p" },
  { value: "1440", label: "1440p" },
  { value: "1080", label: "1080p" },
  { value: "720", label: "720p" },
  { value: "480", label: "480p" },
  { value: "360", label: "360p" },
  { value: "240", label: "240p" },
  { value: "144", label: "144p" },
] as const;

/**
 * Inline validation for a "rung set" list (transcoding_resolutions): a non-empty,
 * duplicate-free, non-blank string array — mirroring vidra-core
 * validateTranscodingResolutions (an empty ladder would disable every rung while
 * transcoding stays on; use the master toggle for that). Non-arrays are ignored
 * (the server's problem); canonical-rung membership is left to the server.
 */
export function validateRungSet(value: SettingValue): string | null {
  if (!Array.isArray(value)) return null;
  if (value.length === 0) {
    return "Enable at least one resolution (turn transcoding off with its toggle instead).";
  }
  const seen = new Set<string>();
  for (const raw of value) {
    const item = String(raw).trim();
    if (item === "") return "A resolution cannot be blank.";
    if (seen.has(item)) return `“${item}” is listed twice.`;
    seen.add(item);
  }
  return null;
}

// --- Per-key presentation metadata -----------------------------------------

export type SettingMeta = {
  label: string;
  help?: string;
  placeholder?: string;
  control: ControlKind;
  page: ConfigPageId;
  section: string;
  /**
   * Progressive disclosure: this key is a child of a parent toggle and stays
   * hidden (indented when shown) until the parent's draft value is on.
   */
  parent?: string;
  /**
   * enum-segmented: the enum values with their picker labels, in display order,
   * kept in lockstep with the server registry's options (the server's `options`
   * array stays the validation truth; these add the labels). Also used by the
   * "list" control as the suggested-token set (e.g. the transcoding rung ladder).
   */
  options?: readonly EnumOption[];
  /**
   * A federation-protocol badge for this row (config-parity W12): names the
   * protocol whose surface the gate governs. Only the four ActivityPub inbox
   * gates carry one today.
   */
  protocol?: SettingProtocol;
  /** Immediate inline validation run on every edit; blocks saving while set. */
  validate?: SettingValidator;
  /**
   * Boot-env dependency: when the /instance snapshot says the backing
   * subsystem is absent, the row renders disabled with this note instead of
   * being silently ineffective. (No current key needs one; W3+ keys — e.g.
   * transcription without WHISPER_ENDPOINT — declare theirs here.)
   */
  bootDep?: { note: string; isSatisfied: (instance: InstanceBootInfo) => boolean };
};

// In DISPLAY ORDER within each section. Any key the backend returns that is
// not listed here still renders (per the placement precedence above) so a new
// setting is never hidden. Conversely, every key here renders even while the
// backend does not return it yet — the row is simply disabled until the
// server supports the setting.
export const META: Record<string, SettingMeta> = {
  // GENERAL / Administrators & contact (server section "contact")
  contact_email: {
    label: "Admin email",
    help: "Shown on the About page and used as the contact-form recipient.",
    placeholder: "admin@example.org",
    control: "text",
    page: "general",
    section: "contact",
  },
  contact_form_enabled: {
    label: "Enable contact form",
    help: "Lets visitors write to you from the About page (needs an admin email and mail delivery).",
    control: "toggle",
    page: "general",
    section: "contact",
  },
  // GENERAL / Platform
  instance_name: {
    label: "Name",
    placeholder: "Vidra",
    control: "text",
    page: "general",
    section: "identity",
  },
  instance_short_description: {
    label: "Short description",
    help: "One or two sentences shown under the name (250 characters max).",
    control: "textarea",
    page: "general",
    section: "identity",
  },
  instance_description: {
    label: "Description",
    help: "The long description on the About page. Markdown is supported.",
    control: "markdown",
    page: "general",
    section: "identity",
  },
  default_language: {
    label: "Default language",
    help: "The main language of this instance.",
    control: "language-select",
    page: "general",
    section: "identity",
  },
  instance_categories: {
    label: "Main instance categories",
    help: "What this instance is mostly about.",
    control: "category-multi",
    page: "general",
    section: "identity",
  },
  moderator_languages: {
    label: "Main languages you/your moderators speak",
    control: "language-multi",
    page: "general",
    section: "identity",
  },
  server_country: {
    label: "Server country",
    help: "Where this server is hosted.",
    control: "country-select",
    page: "general",
    section: "identity",
  },
  // The legal links live on the About page in the server registry (general/about),
  // alongside the other About-page content — not with the identity fields.
  terms_url: {
    label: "Terms of service URL",
    placeholder: "https://…",
    control: "text",
    page: "general",
    section: "about",
  },
  privacy_url: {
    label: "Privacy policy URL",
    placeholder: "https://…",
    control: "text",
    page: "general",
    section: "about",
  },
  // CUSTOMIZATION / Header (config-parity W4). The branding ASSET slots are
  // NOT registry keys — they upload through dedicated admin endpoints and
  // render as the InstanceBrandingManager panel in the General page's
  // Branding section (alwaysRender above); this companion toggle is the one
  // registry key, homed at customization/header to MATCH the server registry
  // placement (vidra-core instancesettings: PageCustomization/"header") so
  // client fallback and server metadata agree.
  // CUSTOMIZATION / Theme (config-parity W5): seeds the pre-paint bootstrap;
  // a visitor's own stored theme choice always wins.
  // CUSTOMIZATION / Theme (config-parity W6): ONE operator color overriding
  // the --accent token pair in both themes. The control shows a live WCAG
  // contrast check against each theme's canvas — a WARNING, never a block
  // (the operator may deliberately favor one theme).
  theme_primary_color: {
    label: "Primary color",
    help: "Replaces the accent color on buttons and highlights, in both themes. Leave empty to keep the built-in monochrome accent.",
    placeholder: "#0f62fe",
    control: "color",
    page: "customization",
    section: "theme",
    validate: validateHexColor,
  },
  default_theme: {
    label: "Default theme",
    help: "The appearance for visitors who have not picked a theme of their own. “System” follows each visitor’s device setting.",
    control: "enum-segmented",
    options: [
      { value: "system", label: "System" },
      { value: "light", label: "Light" },
      { value: "dark", label: "Dark" },
    ],
    page: "customization",
    section: "theme",
  },
  header_hide_instance_name: {
    label: "Hide the instance name in the header",
    help: "Shows the header logo alone. Only takes effect while a header logo is uploaded (General → Branding) — without one the name always shows, so the header is never empty.",
    control: "toggle",
    page: "customization",
    section: "header",
  },
  // CUSTOMIZATION / Player (config-parity W5). One key deliberately seeds
  // BOTH start-on-open and autoplay-next (documented deviation from
  // PeerTube's start-on-open-only auto_play); an explicit per-user or
  // in-session preference is never overridden.
  default_player_autoplay: {
    label: "Autoplay",
    help: "Whether playback starts when a watch page opens and the next video queues up when one ends — for viewers who have not set their own preference. Signed-in players’ saved settings always win.",
    control: "toggle",
    page: "customization",
    section: "player",
  },
  // CUSTOMIZATION / Email (config-parity W6): presentation strings applied at
  // the backend's single plaintext mail seam. Effective only when the
  // deployment has an outbound mail path — the /instance features.mail boot
  // signal drives the disabled-with-explanation treatment; an older backend
  // that does not report the flag renders the rows normally.
  email_subject_prefix: {
    label: "Email subject prefix",
    help: "Prepended to the subject of every email this instance sends. Write {instance_name} to substitute the instance's name.",
    placeholder: "[{instance_name}]",
    control: "text",
    page: "customization",
    section: "email",
    bootDep: {
      note: "Outgoing mail is not configured on this server (SMTP), so emails are never sent. This setting takes effect once mail delivery is set up.",
      isSatisfied: (instance) => instance.features?.mail !== false,
    },
  },
  email_body_signature: {
    label: "Email signature",
    help: "Appended to the end of every email this instance sends.",
    control: "textarea",
    page: "customization",
    section: "email",
    bootDep: {
      note: "Outgoing mail is not configured on this server (SMTP), so emails are never sent. This setting takes effect once mail delivery is set up.",
      isSatisfied: (instance) => instance.features?.mail !== false,
    },
  },
  // GENERAL / Broadcast message (config-parity W3): message/level/dismissable
  // are progressively disclosed under the master toggle.
  broadcast_enabled: {
    label: "Display a message on every page",
    help: "Shows an announcement banner at the top of every page, to every visitor.",
    control: "toggle",
    page: "general",
    section: "broadcast",
  },
  broadcast_message: {
    label: "Message",
    help: "The announcement itself. Markdown is supported.",
    control: "markdown",
    page: "general",
    section: "broadcast",
    parent: "broadcast_enabled",
  },
  broadcast_level: {
    label: "Style",
    help: "How urgently the banner reads: a quiet notice, a warning, or an error.",
    control: "level-segmented",
    page: "general",
    section: "broadcast",
    parent: "broadcast_enabled",
  },
  broadcast_dismissable: {
    label: "Viewers can dismiss the message",
    help: "Dismissal is remembered per browser. Editing the message shows it to everyone again.",
    control: "toggle",
    page: "general",
    section: "broadcast",
    parent: "broadcast_enabled",
  },
  // GENERAL / Landing & browse defaults (config-parity W5). URL params and a
  // viewer's own choices always win — these seed visitors who chose nothing.
  default_landing_page: {
    label: "Landing page",
    help: "What the front page shows a visitor who has not picked anything. “Homepage document” needs an admin-authored homepage (the Homepage page) and shows the default feed until one is enabled.",
    control: "enum-segmented",
    options: [
      { value: "home-recent", label: "Default feed" },
      { value: "trending", label: "Trending" },
      { value: "local", label: "Local feed" },
      { value: "home", label: "Homepage document" },
    ],
    page: "general",
    section: "browse",
  },
  default_feed_sort: {
    label: "Default feed sort",
    help: "How the browse feed is ordered before a viewer picks a sort of their own.",
    control: "enum-segmented",
    options: [
      { value: "recent", label: "Recent" },
      { value: "popular", label: "Popular" },
      { value: "trending", label: "Trending" },
    ],
    page: "general",
    section: "browse",
  },
  default_feed_scope: {
    label: "Default feed reach",
    help: "Whether the feed starts with only this instance’s videos or mixes in federated content. Viewers can always switch.",
    control: "enum-segmented",
    options: [
      { value: "local", label: "Local only" },
      { value: "all", label: "Local + federated" },
    ],
    page: "general",
    section: "browse",
  },
  miniature_prefer_author_display_name: {
    label: "Credit videos to the uploader, not the channel",
    help: "Video cards show the uploader account’s display name instead of the channel name.",
    control: "toggle",
    page: "general",
    section: "browse",
  },
  // GENERAL / About page — the support text is About-page content in the server
  // registry (general/about), not a Social link.
  support_text: {
    label: "Support text",
    help: "How people can support the instance (donations, contributions). Markdown is supported.",
    control: "markdown",
    page: "general",
    section: "about",
  },
  // GENERAL / Social
  website_link: {
    label: "External link",
    placeholder: "https://…",
    control: "text",
    page: "general",
    section: "social",
  },
  mastodon_link: {
    label: "Mastodon link",
    placeholder: "https://…",
    control: "text",
    page: "general",
    section: "social",
  },
  x_link: {
    label: "X link",
    placeholder: "https://…",
    control: "text",
    page: "general",
    section: "social",
  },
  bluesky_link: {
    label: "Bluesky link",
    placeholder: "https://…",
    control: "text",
    page: "general",
    section: "social",
  },
  // Distinct from x_link (an About-page profile URL): this is the twitter:site
  // META-TAG handle on shared link cards (config-parity W4; pairs with the
  // social-card image in the Branding section).
  social_meta_twitter_username: {
    label: "X (Twitter) username for link cards",
    help: "The @handle shared links credit in their preview cards (the twitter:site meta tag) — not the About-page profile link.",
    placeholder: "@vidra",
    control: "text",
    page: "general",
    section: "social",
    validate: validateTwitterHandle,
  },
  // GENERAL / Moderation & sensitive content. The terms / code-of-conduct /
  // moderation-info markdown lives on the About page in the server registry
  // (general/about); only the sensitive-content flags and the upload
  // quarantine gate are the moderation section here.
  instance_is_sensitive: {
    label: "This instance is dedicated to sensitive content",
    control: "toggle",
    page: "general",
    section: "moderation",
  },
  sensitive_content_policy: {
    label: "Policy on videos containing sensitive content",
    help: "Hide removes them from public browse and search; Warn and Blur gate playback behind a notice; Display shows them normally.",
    control: "policy-segmented",
    page: "general",
    section: "moderation",
  },
  quarantine_new_uploads: {
    label: "Quarantine new uploads",
    help: "Hold new uploads for moderator review before they publish.",
    control: "toggle",
    page: "general",
    section: "moderation",
  },
  // GENERAL / About page (server section "about"): the legal + support text
  // above, plus the terms / code of conduct / moderation info, plus the
  // operator's answers about who runs the instance and the hardware note.
  terms: {
    label: "Terms",
    help: "The instance terms, shown on the About page. Markdown is supported.",
    control: "markdown",
    page: "general",
    section: "about",
  },
  code_of_conduct: {
    label: "Code of conduct",
    control: "markdown",
    page: "general",
    section: "about",
  },
  moderation_info: {
    label: "Moderation information",
    help: "Who moderates, what gets removed, how reports are handled. Markdown is supported.",
    control: "markdown",
    page: "general",
    section: "about",
  },
  administrator_info: {
    label: "Who is behind the instance?",
    control: "markdown",
    page: "general",
    section: "about",
  },
  creation_reason: {
    label: "Why did you create this instance?",
    control: "markdown",
    page: "general",
    section: "about",
  },
  maintenance_lifetime: {
    label: "How long do you plan to maintain it?",
    control: "markdown",
    page: "general",
    section: "about",
  },
  business_model: {
    label: "How will you finance the server?",
    control: "markdown",
    page: "general",
    section: "about",
  },
  hardware_info: {
    label: "What server/hardware does the instance run on?",
    control: "markdown",
    page: "general",
    section: "about",
  },
  // GENERAL / Sign-up & new users
  registration_enabled: {
    label: "Allow new registrations",
    help: "When off, the signup page is closed.",
    control: "toggle",
    page: "general",
    section: "signup",
  },
  registration_require_approval: {
    label: "Require approval for new accounts",
    help: "New signups file a pending request an admin must approve.",
    control: "toggle",
    page: "general",
    section: "signup",
    parent: "registration_enabled",
  },
  // Sign-up & new users (config-parity W7).
  registration_require_email_verification: {
    label: "Require email verification",
    help: "New accounts must confirm their email address before they can sign in. Accounts created before this is turned on are never locked out. Composes with approval: approve first, then verify.",
    control: "toggle",
    page: "general",
    section: "signup",
    parent: "registration_enabled",
    bootDep: {
      note: "Outgoing mail is not configured on this server (SMTP), so verification emails cannot be sent. This gate has no effect until mail delivery is set up.",
      isSatisfied: (instance) => instance.features?.mail !== false,
    },
  },
  registration_user_limit: {
    label: "Maximum number of accounts",
    help: "New signups are refused once the instance holds this many accounts (the signup page explains why). 0 = unlimited.",
    control: "number",
    page: "general",
    section: "signup",
    parent: "registration_enabled",
    validate: zeroOrIntRange(1, null, "Must be 0 (unlimited) or a positive number."),
  },
  registration_minimum_age: {
    label: "Minimum age",
    help: 'Signup requires ticking "I am at least N years old" — an attestation, no birthdate is collected. 0 = disabled; otherwise 1–150.',
    control: "number",
    page: "general",
    section: "signup",
    parent: "registration_enabled",
    validate: zeroOrIntRange(1, 150, "Must be 0 (disabled) or between 1 and 150."),
  },
  new_user_history_enabled: {
    label: "Watch history for new accounts",
    help: "Whether accounts created from now on start with watch history enabled. Each user can change it later in their account settings; existing accounts are untouched.",
    control: "toggle",
    page: "general",
    section: "signup",
  },
  // VOD / Comments — vidra-core homes the comments toggle on the VOD page
  // (vod/comments), not General; the MIRROR RULE keeps it there.
  comments_enabled: {
    label: "Comments",
    help: "Allow viewers to comment on videos.",
    control: "toggle",
    page: "vod",
    section: "comments",
  },
  // VOD / Uploads
  uploads_enabled: {
    label: "Video uploads",
    help: "Allow creators to upload video files.",
    control: "toggle",
    page: "vod",
    section: "uploads",
  },
  upload_max_size_bytes: {
    label: "Maximum upload size",
    help: "Largest single video file an upload or URL import may be. 0 = no cap; otherwise at least 1 MiB.",
    control: "bytes",
    page: "vod",
    section: "uploads",
    validate: zeroOrIntRange(1048576, null, "Must be 0 (no cap) or at least 1 MiB (1048576)."),
  },
  upload_max_active_sessions_per_user: {
    label: "Max concurrent uploads per user",
    help: "Resumable upload sessions one user may hold open at once. 0 = unlimited.",
    control: "number",
    page: "vod",
    section: "uploads",
  },
  default_user_quota_bytes: {
    label: "Default storage quota per user",
    help: "Bytes each account may store. Per-user overrides still win. 0 = unlimited.",
    control: "bytes",
    page: "vod",
    section: "uploads",
  },
  default_user_daily_quota_bytes: {
    label: "Daily upload quota per user",
    help: "Bytes each account may upload in a rolling 24-hour window (config-parity W7). Deleting videos does not refund the window. 0 = unlimited.",
    control: "bytes",
    page: "vod",
    section: "uploads",
  },
  video_replace_enabled: {
    label: "Allow replacing video files",
    help: "Let creators upload a new source file for an already-published video. The video keeps its URL, stats, and metadata; viewers keep watching the current version until the replacement finishes processing. Counts against the uploader's quotas.",
    control: "toggle",
    page: "vod",
    section: "uploads",
    parent: "uploads_enabled",
  },
  // Config-parity W8. Disclosed under uploads_enabled (mirrors video_replace_enabled).
  upload_additional_extensions_enabled: {
    label: "Allow additional container formats",
    help: "Accept the extended set of upload container formats beyond the core web-native ones. On by default (vidra's shipped allow-list).",
    control: "toggle",
    page: "vod",
    section: "uploads",
    parent: "uploads_enabled",
  },
  // VOD / Imports
  imports_enabled: {
    label: "URL imports",
    help: "Allow creators to import a video from a URL.",
    control: "toggle",
    page: "vod",
    section: "imports",
  },
  import_max_height: {
    label: "Import resolution cap",
    help: "Highest resolution URL imports fetch. 0 = no cap; otherwise 144–4320.",
    control: "number",
    page: "vod",
    section: "imports",
    parent: "imports_enabled",
    validate: zeroOrIntRange(144, 4320, "Must be 0 (no cap) or between 144 and 4320."),
  },
  // Import sub-path + worker knobs (config-parity W8/W10). imports_enabled is
  // the master switch, so these disclose under it (mirrors import_max_height).
  import_http_enabled: {
    label: "URL/platform imports (yt-dlp)",
    help: "Allow importing from platform URLs via yt-dlp. Needs the yt-dlp resolver configured at boot; URL imports as a whole are gated by the master switch above.",
    control: "toggle",
    page: "vod",
    section: "imports",
    parent: "imports_enabled",
  },
  import_jobs_concurrency: {
    label: "Import job concurrency",
    help: "How many URL-import jobs run in parallel per worker tick. 1–16.",
    control: "number",
    page: "vod",
    section: "imports",
    parent: "imports_enabled",
    validate: intRange(1, 16, "Must be between 1 and 16."),
  },
  channel_sync_enabled: {
    label: "Channel sync",
    help: "Let creators bind a remote channel and auto-import its new videos on a schedule.",
    control: "toggle",
    page: "vod",
    section: "imports",
  },
  channel_sync_max_per_user: {
    label: "Max channel syncs per user",
    help: "How many channel-sync bindings one account may create. 0 = unlimited.",
    control: "number",
    page: "vod",
    section: "imports",
    parent: "channel_sync_enabled",
    validate: zeroOrIntRange(1, 10000, "Must be 0 (unlimited) or between 1 and 10000."),
  },
  // VOD / Transcoding (config-parity W10). transcoding_enabled is the master;
  // the ladder + tuning knobs disclose under it.
  transcoding_enabled: {
    label: "Transcoding",
    help: "Process uploaded videos into an HLS rendition ladder. Needs ffmpeg/ffprobe available at boot. Off leaves videos in their original file only.",
    control: "toggle",
    page: "vod",
    section: "transcoding",
  },
  // Config-parity W1/W10: the only KindList registry key. A real list control —
  // token chips over the canonical rung heights (server validates membership),
  // with duplicate/empty inline validation.
  transcoding_resolutions: {
    label: "Transcoding ladder",
    help: "Which resolution rungs the HLS ladder produces (each ≤ the source is generated). Enable at least one; the shipped default is 1080p–360p.",
    control: "list",
    options: TRANSCODING_RUNG_OPTIONS,
    page: "vod",
    section: "transcoding",
    parent: "transcoding_enabled",
    validate: validateRungSet,
  },
  transcoding_max_fps: {
    label: "Frame-rate cap",
    help: "Cap the output frame rate, applied only when the source exceeds it. 0 = no cap; otherwise 24–240.",
    control: "number",
    page: "vod",
    section: "transcoding",
    parent: "transcoding_enabled",
    validate: zeroOrIntRange(24, 240, "Must be 0 (no cap) or between 24 and 240."),
  },
  transcoding_threads: {
    label: "Threads per job",
    help: "FFmpeg threads per transcode job. 0 = let FFmpeg decide; otherwise 1–64.",
    control: "number",
    page: "vod",
    section: "transcoding",
    parent: "transcoding_enabled",
    validate: zeroOrIntRange(1, 64, "Must be 0 (FFmpeg default) or between 1 and 64."),
  },
  transcoding_concurrency: {
    label: "Transcode job concurrency",
    help: "How many transcode jobs run in parallel per worker tick. 1–16.",
    control: "number",
    page: "vod",
    section: "transcoding",
    parent: "transcoding_enabled",
    validate: intRange(1, 16, "Must be between 1 and 16."),
  },
  transcoding_original_resolution: {
    label: "Keep an original-resolution rung",
    help: "Also produce an HLS rung at the source's own resolution when it exceeds the ladder's top rung.",
    control: "toggle",
    page: "vod",
    section: "transcoding",
    parent: "transcoding_enabled",
  },
  // VOD / Playback: availability plus the inherited viewer default. A user's
  // explicit playback preference wins over the default; the master gate wins
  // over both and prevents all automatic card playback while disabled.
  video_card_previews_enabled: {
    label: "Inline video-card previews",
    help: "Make seekable hover playback available on video cards. Signed-in viewers can still turn previews on or off in their playback settings.",
    control: "toggle",
    page: "vod",
    section: "playback",
  },
  video_card_previews_default_enabled: {
    label: "Enable previews by default",
    help: "Choose the starting behavior for signed-in viewers who have not made their own choice. Existing viewer choices are preserved.",
    control: "toggle",
    page: "vod",
    section: "playback",
    parent: "video_card_previews_enabled",
  },
  // VOD / Storyboards (config-parity W8).
  storyboards_enabled: {
    label: "Seek-preview storyboards",
    help: "Generate the seek-preview thumbnail sprite when a video publishes (needs ffmpeg).",
    control: "toggle",
    page: "vod",
    section: "storyboards",
  },
  // VOD / Transcription (config-parity W8).
  transcription_enabled: {
    label: "Automatic transcription",
    help: "Generate captions for uploaded videos automatically. Effective only when a transcription backend (WHISPER_ENDPOINT) is configured at boot.",
    control: "toggle",
    page: "vod",
    section: "transcription",
  },
  // VOD / Downloads
  downloads_enabled: {
    label: "Video downloads",
    help: "Allow regular viewers to download video files. Moderators and admins always retain access.",
    control: "toggle",
    page: "vod",
    section: "downloads",
  },
  // VOD / Publish defaults (config-parity W9: defaults.publish)
  default_video_privacy: {
    label: "Default privacy",
    help: "The privacy a new video starts with when its creator does not choose one. Password-protected is never a default (it needs a password first).",
    control: "enum-segmented",
    options: [
      { value: "public", label: "Public" },
      { value: "unlisted", label: "Unlisted" },
      { value: "private", label: "Private" },
    ],
    page: "vod",
    section: "publish-defaults",
  },
  default_video_licence: {
    label: "Default licence",
    help: "The licence id preselected on the publish form (PeerTube-compatible: 1–6 Creative Commons, 7 CC0). 0 = no default — the picker starts empty.",
    control: "number",
    page: "vod",
    section: "publish-defaults",
    validate: zeroOrIntRange(1, 7, "Must be 0 (no default) or a licence id between 1 and 7."),
  },
  default_comment_policy: {
    label: "Default comment policy",
    help: "Whether new videos start with comments on. Creators can change it per video; existing comments always stay readable.",
    control: "enum-segmented",
    options: [
      { value: "enabled", label: "Enabled" },
      { value: "disabled", label: "Disabled" },
    ],
    page: "vod",
    section: "publish-defaults",
  },
  default_download_enabled: {
    label: "Downloads on new videos",
    help: "Whether new videos start downloadable. Only effective while video downloads are enabled instance-wide; creators can change it per video.",
    control: "toggle",
    page: "vod",
    section: "publish-defaults",
  },
  // GENERAL / Channels (config-parity W8).
  max_channels_per_user: {
    label: "Max channels per user",
    help: "How many channels one account may create. 0 = unlimited.",
    control: "number",
    page: "general",
    section: "channels",
    validate: zeroOrIntRange(1, 10000, "Must be 0 (unlimited) or between 1 and 10000."),
  },
  // LIVE / Streaming (server section "streaming"). The replay + limit keys
  // disclose under live_enabled; save-replay discloses under live_allow_replay.
  live_enabled: {
    label: "Live streaming",
    help: "Allow creators to run live streams.",
    control: "toggle",
    page: "live",
    section: "streaming",
  },
  // LIVE / Replay (config-parity W11).
  live_allow_replay: {
    label: "Allow replays",
    help: "Master switch for recording live streams into keepable videos. Off produces no replay regardless of a stream's own setting.",
    control: "toggle",
    page: "live",
    section: "replay",
    parent: "live_enabled",
  },
  live_default_save_replay: {
    label: "Save replays by default",
    help: "Whether a new live stream saves its replay unless the creator opts out. No effect while replays are turned off above.",
    control: "toggle",
    page: "live",
    section: "replay",
    parent: "live_allow_replay",
  },
  // LIVE / Limits (config-parity W11).
  live_max_instance_lives: {
    label: "Max concurrent live streams (instance)",
    help: "How many live streams may run at once across the whole instance. 0 = unlimited.",
    control: "number",
    page: "live",
    section: "limits",
    parent: "live_enabled",
    validate: zeroOrIntRange(1, 10000, "Must be 0 (unlimited) or between 1 and 10000."),
  },
  live_max_user_lives: {
    label: "Max concurrent live streams (per user)",
    help: "How many live streams one account may run at once. 0 = unlimited.",
    control: "number",
    page: "live",
    section: "limits",
    parent: "live_enabled",
    validate: zeroOrIntRange(1, 10000, "Must be 0 (unlimited) or between 1 and 10000."),
  },
  live_max_duration_secs: {
    label: "Maximum stream duration",
    help: "Force-close a live stream after this many seconds. 0 = no limit; otherwise 60–2592000 (up to 30 days).",
    control: "number",
    page: "live",
    section: "limits",
    parent: "live_enabled",
    validate: zeroOrIntRange(60, 2592000, "Must be 0 (no limit) or between 60 and 2592000 seconds."),
  },
  // FEDERATION / Remote comments (config-parity W12). Every federation gate
  // governs the ActivityPub inbox (internal/federation/inbox.go) — hence the
  // ActivityPub protocol badge; vidra's ATProto path is outbound-only with no
  // inbound gate, so none of these touch it. None are retroactive.
  federation_accept_remote_comments: {
    label: "Accept remote comments",
    help: "Ingest comments federated in from other instances. Off drops them after the blocked-domain check. Comments already ingested are untouched.",
    control: "toggle",
    page: "federation",
    section: "comments",
    protocol: "activitypub",
  },
  // FEDERATION / Followers (config-parity W12).
  federation_allow_channel_followers: {
    label: "Allow remote followers",
    help: "Let remote accounts follow this instance's channels. Off answers inbound follow requests with a rejection. Existing followers stay.",
    control: "toggle",
    page: "federation",
    section: "followers",
    protocol: "activitypub",
  },
  federation_follower_approval: {
    label: "Require follower approval",
    help: "Hold new remote channel-follow requests in the admin queue instead of auto-accepting them.",
    control: "toggle",
    page: "federation",
    section: "followers",
    protocol: "activitypub",
  },
  federation_auto_follow_back: {
    label: "Auto-follow back",
    help: "When a remote account follows one of this instance's channels, automatically follow that account back from the channel. Warning: this weakens reactive moderation — you end up following accounts you have not vetted.",
    control: "toggle",
    page: "federation",
    section: "followers",
    protocol: "activitypub",
  },
  // FEDERATION / Remote search (config-parity W13). Both are moot while
  // federation is off (the boot note on this page explains that).
  search_remote_uri_users: {
    label: "Remote search for signed-in users",
    help: "Let signed-in users resolve a URL- or handle-shaped search query into the matching remote video, channel, or account through federation.",
    control: "toggle",
    page: "federation",
    section: "search",
  },
  search_remote_uri_anonymous: {
    label: "Remote search for anonymous visitors",
    help: "The same remote resolution for logged-out visitors. Off by default — anonymous traffic is the main SSRF/abuse surface.",
    control: "toggle",
    page: "federation",
    section: "search",
  },
  // ADVANCED / Search & recommendations (search-service W4). Server section
  // "search" on the advanced page. Defaults preserve the shipped behaviour:
  // simple mode, everything on. The bools are the INSTANCE half of the
  // two-factor per-request gate (instance setting AND user pref AND signed-in).
  //
  // The master toggle: when off, search routes to the built-in deterministic
  // (backup SQL) path and suggestions are disabled instance-wide.
  search_service_enabled: {
    label: "Smart search service",
    help: "Use the smart search service for ranking and autocomplete. When off, Vidra falls back to the built-in deterministic search and suggestions are disabled.",
    control: "toggle",
    page: "advanced",
    section: "search",
  },
  search_mode: {
    label: "Ranking mode",
    help: "How search and recommendations rank results. Simple uses deterministic heuristics; Advanced adds learned and behavioural signals (needs the search service to have collected enough activity).",
    control: "enum-segmented",
    options: [
      { value: "simple", label: "Simple" },
      { value: "advanced", label: "Advanced" },
    ],
    page: "advanced",
    section: "search",
  },
  search_suggestions_enabled: {
    label: "Autocomplete suggestions",
    help: "Show query, video, channel, and tag suggestions as visitors type in the search box.",
    control: "toggle",
    page: "advanced",
    section: "search",
  },
  personalized_search_enabled: {
    label: "Personalized search",
    help: "Allow search results to be tailored to a signed-in user's activity. Each user can still opt out in their own settings.",
    control: "toggle",
    page: "advanced",
    section: "search",
  },
  personalized_recommendations_enabled: {
    label: "Personalized recommendations",
    help: "Allow the home and related-video rails to be tailored to a signed-in user's activity. Each user can still opt out in their own settings.",
    control: "toggle",
    page: "advanced",
    section: "search",
  },
  search_history_enabled: {
    label: "Search history",
    help: "Let signed-in users keep a personal search history that powers their suggestions. Each user can still turn theirs off and clear it.",
    control: "toggle",
    page: "advanced",
    section: "search",
  },
  search_event_retention_days: {
    label: "Behavioural event retention",
    help: "How many days the search service keeps raw behavioural events (searches, clicks, plays) before deleting them. Aggregates may be kept longer. 1–365.",
    control: "number",
    page: "advanced",
    section: "search",
    validate: intRange(1, 365, "Must be between 1 and 365 days."),
  },
  search_min_query_user_count: {
    label: "Minimum distinct users for a suggestion",
    help: "How many different people must have run a query before it can appear as a global autocomplete suggestion — a privacy guard so a rare, personal query never becomes a public suggestion. 1–100.",
    control: "number",
    page: "advanced",
    section: "search",
    validate: intRange(1, 100, "Must be between 1 and 100 users."),
  },
  // ADVANCED / User data portability (config-parity W8). Server section
  // "user_data" (normalized to "user-data").
  user_import_enabled: {
    label: "Account import",
    help: "Let users import an account archive (channels, videos, and metadata) into their account.",
    control: "toggle",
    page: "advanced",
    section: "user-data",
  },
  user_export_enabled: {
    label: "Account export",
    help: "Let users generate a downloadable archive of their account data.",
    control: "toggle",
    page: "advanced",
    section: "user-data",
  },
  user_export_expiration_hours: {
    label: "Export link lifetime",
    help: "How many hours a finished export archive stays downloadable before it is cleaned up. 0 = never expires; otherwise 1–8760.",
    control: "number",
    page: "advanced",
    section: "user-data",
    parent: "user_export_enabled",
    validate: zeroOrIntRange(1, 8760, "Must be 0 (never expires) or between 1 and 8760 hours."),
  },
  user_export_max_quota_bytes: {
    label: "Maximum export size",
    help: "Refuse to generate an export while the account's stored data exceeds this size. 0 = unlimited.",
    control: "bytes",
    page: "advanced",
    section: "user-data",
    parent: "user_export_enabled",
  },
};

// --- Placement ---------------------------------------------------------------

/** Sanitize a server-provided section id into a safe anchor slug. */
function normalizeSectionId(section: unknown): string | null {
  if (typeof section !== "string") return null;
  const slug = section
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? null : slug;
}

/**
 * Where a key renders. Server placement metadata wins when present and valid;
 * then this client's META map; then the Advanced page's "Other settings".
 */
export function placementFor(
  key: string,
  server?: { page?: string; section?: string },
): { page: ConfigPageId; section: string } {
  const meta = META[key];
  if (server && isConfigPageId(server.page)) {
    const section = normalizeSectionId(server.section);
    if (section) return { page: server.page, section };
    // Server named a page but no (usable) section: keep the client section if
    // it agrees on the page, otherwise the page's auto-render fallback.
    if (meta && meta.page === server.page) return { page: server.page, section: meta.section };
    return { page: server.page, section: OTHER_SECTION_ID };
  }
  if (meta) return { page: meta.page, section: meta.section };
  return { page: "advanced", section: OTHER_SECTION_ID };
}

// --- Page model ---------------------------------------------------------------

export type PageSection = {
  section: SectionDef;
  keys: string[];
};

/**
 * The render model for one config page: its non-empty sections (plus
 * alwaysRender panel sections, even key-less) in display order (known
 * sections first, then server-invented auto sections in first-seen order,
 * then "Other settings"), each with its keys — META keys in META order
 * (including keys the server does not return yet, which render disabled),
 * then unknown server keys in server order.
 */
export function buildPageModel(
  page: ConfigPageId,
  settings: PlacedInstanceSetting[],
): PageSection[] {
  const byKey = new Map(settings.map((s) => [s.key, s]));
  const buckets = new Map<string, string[]>();
  const autoOrder: string[] = [];
  const known = PAGE_SECTIONS[page];
  const knownIds = new Set(known.map((s) => s.id));

  const add = (sectionId: string, key: string) => {
    let bucket = buckets.get(sectionId);
    if (!bucket) {
      bucket = [];
      buckets.set(sectionId, bucket);
      if (!knownIds.has(sectionId) && sectionId !== OTHER_SECTION_ID) autoOrder.push(sectionId);
    }
    bucket.push(key);
  };

  for (const key of Object.keys(META)) {
    const placement = placementFor(key, byKey.get(key));
    if (placement.page === page) add(placement.section, key);
  }
  for (const setting of settings) {
    if (META[setting.key]) continue;
    const placement = placementFor(setting.key, setting);
    if (placement.page === page) add(placement.section, setting.key);
  }

  const sections: PageSection[] = [];
  for (const def of known) {
    const keys = buckets.get(def.id);
    // A panel section (alwaysRender) is part of the page even with no
    // registry keys — its content does not come from the registry.
    if ((keys && keys.length > 0) || def.alwaysRender) sections.push({ section: def, keys: keys ?? [] });
  }
  for (const id of autoOrder) {
    const keys = buckets.get(id);
    if (keys && keys.length > 0) {
      sections.push({
        section: {
          id,
          title: humanizeSectionId(id),
          description: "",
        },
        keys,
      });
    }
  }
  const other = buckets.get(OTHER_SECTION_ID);
  if (other && other.length > 0) sections.push({ section: OTHER_SECTION, keys: other });
  return sections;
}

// --- Display helpers -----------------------------------------------------------

/** The empty/default draft value for a control kind (missing-key rows). */
export function emptyValueFor(control: ControlKind): SettingValue {
  if (control === "toggle") return false;
  if (control === "category-multi" || control === "language-multi" || control === "list") return [];
  if (control === "number" || control === "bytes") return 0;
  return "";
}

export function controlFor(key: string, setting: InstanceSetting | undefined): ControlKind {
  const meta = META[key];
  if (meta) return meta.control;
  // Unknown server key ("Other settings" / auto sections): render by server
  // type. A list-kind key gets the generic editable token control (so an array
  // value is never blanked into a bare string that the server's array validator
  // 422s); a future unknown enum kind still falls back to a plain text row (it
  // stays visible; proper editing arrives with its META entry).
  if (setting?.type === "bool") return "toggle";
  if (setting?.type === "int") return "number";
  if (setting?.type === "list") return "list";
  return "text";
}

/**
 * A short human description of a setting's config DEFAULT, shown next to the
 * "Overridden" badge so the effective-vs-default comparison is explicit.
 */
export function describeSettingDefault(
  setting: PlacedInstanceSetting,
  control: ControlKind,
): string {
  const value = setting.default;
  if (typeof value === "boolean") return value ? "on" : "off";
  if (typeof value === "number") {
    if (control === "bytes") return value === 0 ? "unlimited" : formatBytes(value);
    return String(value);
  }
  if (Array.isArray(value)) return value.length === 0 ? "none" : value.join(", ");
  if (value === "") return "empty";
  return value.length > 48 ? `${value.slice(0, 48)}…` : value;
}

/** The disabled-with-explanation note for a row whose boot dependency is absent. */
export function bootDepNote(
  meta: SettingMeta | undefined,
  instance: InstanceBootInfo | null,
): string | null {
  if (!meta?.bootDep || instance === null) return null;
  return meta.bootDep.isSatisfied(instance) ? null : meta.bootDep.note;
}
