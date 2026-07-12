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

// Known sections per page, in display order. Empty-today sections (broadcast,
// transcoding, …) are pre-declared so W3+ registry keys — placed by server
// metadata — land under a properly titled header with zero frontend work.
export const PAGE_SECTIONS: Record<ConfigPageId, SectionDef[]> = {
  general: [
    {
      id: "administrators",
      title: "Administrators",
      description: "Who runs this instance and how visitors can reach them.",
    },
    {
      id: "identity",
      title: "Platform",
      description: "The public identity of this instance: name, descriptions, and classification.",
    },
    {
      id: "branding",
      title: "Branding",
      description:
        "The imagery this instance presents: avatar, banner, header logos, favicon, and the social-card image.",
      // The section's content is the InstanceBrandingManager panel (dedicated
      // upload/delete endpoints, not registry keys), so it renders regardless
      // of which registry keys the server places here.
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
      description: "How people can support and follow the instance elsewhere.",
    },
    {
      id: "moderation",
      title: "Moderation & sensitive content",
      description: "Rules of the house and how sensitive videos are treated.",
    },
    {
      id: "about",
      title: "You and your platform",
      description: "The questions every visitor deserves an answer to, shown on the About page.",
    },
    {
      id: "other-info",
      title: "Other information",
      description: "Technical background about this deployment.",
    },
    {
      id: "signup",
      title: "Sign-up & new users",
      description: "Whether people can sign up, and what new accounts start with.",
    },
    {
      id: "discussion",
      title: "Comments",
      description: "Whether viewers can discuss videos on this instance.",
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
      id: "downloads",
      title: "Downloads",
      description: "Whether viewers can save video files from this instance.",
    },
    {
      id: "publish",
      title: "Publish defaults",
      description: "What a new video starts with before its creator changes anything.",
    },
  ],
  live: [
    {
      id: "live",
      title: "Live streaming",
      description: "Whether creators can go live, and the limits on running streams.",
    },
  ],
  federation: [
    {
      id: "policy",
      title: "Inbound policy",
      description:
        "What this instance accepts from remote instances. Each setting is labeled with the protocol it governs.",
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
      // editor panel (the W1 document store, not a registry key).
      alwaysRender: true,
    },
  ],
  advanced: [
    // Config-parity W6: the custom CSS/JS document editors (architecture
    // note 6's security posture — CSS first, JS danger-styled behind a typed
    // confirmation). Panel sections over the W1 document store, not registry
    // keys.
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
      id: "search",
      title: "Search",
      description: "How far search reaches beyond this instance.",
    },
    {
      id: "data",
      title: "User data portability",
      description: "Letting people take their account data with them.",
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
  | "color"; // hex input + swatch + live WCAG contrast warnings (W6 primary color)

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
   * enum-segmented only: the enum values with their picker labels, in display
   * order — kept in lockstep with the server registry's options (the server's
   * `options` array stays the validation truth; these add the labels).
   */
  options?: readonly EnumOption[];
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
  // GENERAL / Administrators
  contact_email: {
    label: "Admin email",
    help: "Shown on the About page and used as the contact-form recipient.",
    placeholder: "admin@example.org",
    control: "text",
    page: "general",
    section: "administrators",
  },
  contact_form_enabled: {
    label: "Enable contact form",
    help: "Lets visitors write to you from the About page (needs an admin email and mail delivery).",
    control: "toggle",
    page: "general",
    section: "administrators",
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
  terms_url: {
    label: "Terms of service URL",
    placeholder: "https://…",
    control: "text",
    page: "general",
    section: "identity",
  },
  privacy_url: {
    label: "Privacy policy URL",
    placeholder: "https://…",
    control: "text",
    page: "general",
    section: "identity",
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
  // GENERAL / Social
  support_text: {
    label: "Support text",
    help: "How people can support the instance (donations, contributions). Markdown is supported.",
    control: "markdown",
    page: "general",
    section: "social",
  },
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
  // GENERAL / Moderation & sensitive content
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
  terms: {
    label: "Terms",
    help: "The instance terms, shown on the About page. Markdown is supported.",
    control: "markdown",
    page: "general",
    section: "moderation",
  },
  code_of_conduct: {
    label: "Code of conduct",
    control: "markdown",
    page: "general",
    section: "moderation",
  },
  moderation_info: {
    label: "Moderation information",
    help: "Who moderates, what gets removed, how reports are handled. Markdown is supported.",
    control: "markdown",
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
  // GENERAL / You and your platform
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
  // GENERAL / Other information
  hardware_info: {
    label: "What server/hardware does the instance run on?",
    control: "markdown",
    page: "general",
    section: "other-info",
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
  // GENERAL / Comments
  comments_enabled: {
    label: "Comments",
    help: "Allow viewers to comment on videos.",
    control: "toggle",
    page: "general",
    section: "discussion",
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
  // VOD / Downloads
  downloads_enabled: {
    label: "Video downloads",
    help: "Allow regular viewers to download video files. Moderators and admins always retain access.",
    control: "toggle",
    page: "vod",
    section: "downloads",
  },
  // LIVE
  live_enabled: {
    label: "Live streaming",
    help: "Allow creators to run live streams.",
    control: "toggle",
    page: "live",
    section: "live",
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
  if (control === "category-multi" || control === "language-multi") return [];
  if (control === "number" || control === "bytes") return 0;
  return "";
}

export function controlFor(key: string, setting: InstanceSetting | undefined): ControlKind {
  const meta = META[key];
  if (meta) return meta.control;
  // Unknown server key ("Other settings" / auto sections): render by server
  // type. A future unknown enum/list kind falls back to a plain text row (it
  // stays visible; proper editing arrives with its META entry).
  if (setting?.type === "bool") return "toggle";
  if (setting?.type === "int") return "number";
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
