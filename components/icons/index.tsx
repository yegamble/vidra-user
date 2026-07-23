import type { SVGProps } from "react";

/*
 * Typed, minified inline SVG icon set — the single source of truth for iconography
 * across the app. Feather-style: 24×24 viewBox, `stroke="currentColor"`, round
 * caps/joins, 1.8px default stroke (callers bump to 2–2.4 at small sizes, 1.9 in
 * the desktop sidebar). Paths are vendored VERBATIM from the design source
 * (`.ralph/specs/design-refresh-icons.md`) so every surface converges on one set;
 * no icon-font / SVG-sprite / runtime icon dependency — each icon is a tiny
 * component.
 *
 * Attribution: several paths are identical or near-identical to Feather Icons,
 * MIT License, Copyright (c) 2013–2023 Cole Bemis (https://feathericons.com).
 * A handful (heart, library, playlist glyph, IPFS cube) are bespoke design draws.
 *
 * Accessibility: an icon is decorative by default (`aria-hidden`, skipped by
 * screen readers) because it almost always sits next to a text label. Pass a
 * `label` to make it a standalone image with an accessible name (e.g. an
 * icon-only control that has no adjacent text — though prefer IconButton, which
 * labels the button itself).
 *
 * Filled-by-design glyphs (Play, Playlist, MoreHorizontal, and Library's inner
 * play) set `fill="currentColor" stroke="none"` on their own child elements,
 * overriding the outline default of the shared <Icon> wrapper.
 *
 * Tier 3 bundle audit: Next 16.2's native Turbopack analyzer reports this
 * client module at ~3.3 KB compressed. Keep the single typed source instead of
 * creating 55 per-icon files; the transfer saving would be negligible and
 * Turbopack already analyzes named imports without optimizePackageImports.
 */
export type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  /** Pixel size for width & height (default 20). */
  size?: number;
  /** Stroke width (default 1.8 — the design standard). */
  strokeWidth?: number | string;
  /** Accessible name. Omit for decorative icons (default: aria-hidden). */
  label?: string;
};

function Icon({
  size = 20,
  strokeWidth = 1.8,
  label,
  ...props
}: IconProps & { children: React.ReactNode }) {
  const { children, ...rest } = props as IconProps & { children: React.ReactNode };
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      {...rest}
    >
      {label ? <title>{label}</title> : null}
      {children}
    </svg>
  );
}

/* ── Navigation / chrome ─────────────────────────────────────────────────── */

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4-4" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m4.5 12.5 5 5 10-11" />
    </Icon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m9 5 7 7-7 7" />
    </Icon>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M15 4l-8 8 8 8" />
    </Icon>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 12h16" />
      <path d="M4 6h16" />
      <path d="M4 18h16" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

/** Create (tab bar) — rounded plus-square, rx6 (NOT feather's rx2). */
export function PlusSquareIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="2.5" width="19" height="19" rx="6" />
      <path d="M12 8v8M8 12h8" />
    </Icon>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </Icon>
  );
}

export function TrendingUpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </Icon>
  );
}

/** Subscriptions (desktop nav). */
export function TvIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <path d="M7 5h10M9 2h6" />
    </Icon>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </Icon>
  );
}

/** Library — bookmark-ish rect with a FILLED inner play + spine. */
export function LibraryIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="m9 9.5 4 2.5-4 2.5z" fill="currentColor" stroke="none" />
      <path d="M19 5h2v14" />
    </Icon>
  );
}

/** Studio / video content. */
export function VideoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m10 9 5 3-5 3z" />
    </Icon>
  );
}

/** Hash / tag — the "#" glyph for a tag suggestion. */
export function HashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />
    </Icon>
  );
}

/* ── Communication ───────────────────────────────────────────────────────── */

export function BellIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </Icon>
  );
}

/** Messages / comment. */
export function MessageCircleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.6 0-3.1-.4-4.4-1.2L3 20l1.2-5.1A8.5 8.5 0 1 1 21 11.5z" />
    </Icon>
  );
}

/** E2EE / 2FA lock. Folds in the former components/e2ee/LockIcon. */
export function LockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </Icon>
  );
}

/** Attachment / document. */
export function FileIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </Icon>
  );
}

/** Send (DM). */
export function ArrowUpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </Icon>
  );
}

/** Captions — speech box with a sharp bottom-left corner. */
export function CaptionsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 4h16v12H8l-4 4z" />
    </Icon>
  );
}

/* ── Actions ─────────────────────────────────────────────────────────────── */

/** Upload — flat base bar (not feather's tray). */
export function UploadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 16V4m0 0L7 9m5-5 5 5" />
      <path d="M4 20h16" />
    </Icon>
  );
}

/** Download — tray + arrow down. */
export function DownloadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4v9m0 0 3.5-3.5M12 13 8.5 9.5" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </Icon>
  );
}

/** Share — tray + arrow up. */
export function ShareIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v9M8.5 8.5 12 5l3.5 3.5" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </Icon>
  );
}

/** Support / donate — bespoke heart (differs from feather's heart). */
export function HeartIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 21s-7.5-4.6-9.5-8.6C.9 9 2.7 5.5 6.2 5.5c2 0 3.3 1 4 2.1.7-1.1 2-2.1 4-2.1 3.5 0 5.3 3.5 3.7 6.9-2 4-9.9 8.6-9.9 8.6z" />
    </Icon>
  );
}

/** Report — pennant-style flag. */
export function FlagIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 21V5a1 1 0 0 1 1-1h13l-3 5 3 5H5" />
    </Icon>
  );
}

/*
 * Thumbs up/down — the like/dislike control (RatingControls) has no counterpart
 * in the design source (its watch actions row is Support/Share/Download/Save/
 * Report), so these two are vendored from Feather Icons (MIT, already credited in
 * the header) rather than the design files. Feather-standard single-path draws;
 * they share the set's 1.8 default stroke and round caps/joins.
 */
export function ThumbsUpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </Icon>
  );
}

export function ThumbsDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zM17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
    </Icon>
  );
}

/** Save-to-playlist glyph — FILLED list + note. */
export function PlaylistIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M4 5h12v2H4zM4 9h12v2H4zM4 13h8v2H4zM17 12v6.5a2.5 2.5 0 1 1-2-2.45V10l6-1.5V12z"
        fill="currentColor"
        stroke="none"
      />
    </Icon>
  );
}

/** Overflow menu — FILLED dots. */
export function MoreHorizontalIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="5" cy="12" r="2.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="2.2" fill="currentColor" stroke="none" />
    </Icon>
  );
}

/** Overflow menu — vertical FILLED dots for compact video cards. */
export function MoreVerticalIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="5" r="2.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="2.2" fill="currentColor" stroke="none" />
    </Icon>
  );
}

/** Play (player) — FILLED triangle. */
export function PlayIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 4.5v15l13-7.5z" fill="currentColor" stroke="none" />
    </Icon>
  );
}

/** Spinner arc — pair with `animate-spin` at the call site. */
export function LoaderIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2.4} {...props}>
      <path d="M21 12a9 9 0 1 1-6.2-8.56" />
    </Icon>
  );
}

/** Re-fetch / retry. */
export function RotateCwIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
    </Icon>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </Icon>
  );
}

/* ── Status / meta ───────────────────────────────────────────────────────── */

export function InfoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4M12 16h.01" />
    </Icon>
  );
}

/** Warning / error — alert triangle. */
export function WarningIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </Icon>
  );
}

/** User / follower. */
export function UserIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </Icon>
  );
}

/** Moderation / held for review. */
export function ShieldIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" />
    </Icon>
  );
}

/** Blocked overlay — slash in a circle. */
export function SlashCircleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.5 5.5l13 13" />
    </Icon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </Icon>
  );
}

export function ExternalLinkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </Icon>
  );
}

/* ── Admin ───────────────────────────────────────────────────────────────── */

/** Admin overview — masonry grid. */
export function GridIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="5" rx="2" />
      <rect x="13" y="10" width="8" height="11" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" />
    </Icon>
  );
}

/** Admin users. */
export function UsersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 3-5.5 6.5-5.5s6.5 1.9 6.5 5.5" />
      <path d="M16 5a3.5 3.5 0 0 1 0 6.5M18.5 14.5c2 .8 3 2.4 3 4.5" />
    </Icon>
  );
}

/** Admin instance — server stack. */
export function ServerIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="7" rx="2" />
      <rect x="3" y="13" width="18" height="7" rx="2" />
      <path d="M7 7.5h.01M7 16.5h.01" />
    </Icon>
  );
}

/* ── Settings / destinations (redesign icon-tile rows) ───────────────────────
 * Feather Icons (MIT, credited in the header) vendored for the System-Settings
 * grouped rows (Profile / Security / Notifications / Playback / Search / Devices
 * / Connections / Donations / Privacy), Moderation mail triage, and Studio
 * storage. Same 24×24 / 1.8-stroke / round-cap convention as the rest of the set.
 */

/** Mail — Moderation triage, notification prefs, contact. */
export function MailIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </Icon>
  );
}

/** Sliders — playback / adjustable settings (feather "sliders", vertical). */
export function SlidersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
      <path d="M1 14h6M9 8h6M17 16h6" />
    </Icon>
  );
}

/** Credit card — donations / payment settings. */
export function CreditCardIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <path d="M2.5 10h19" />
    </Icon>
  );
}

/** Database — storage / media capacity. */
export function DatabaseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </Icon>
  );
}

/** Link — connections / linked accounts. */
export function LinkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </Icon>
  );
}

/** Eye — visibility / privacy on. */
export function EyeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

/** Eye-off — hidden / privacy off. */
export function EyeOffIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <path d="M14.12 14.12A3 3 0 1 1 9.88 9.88" />
      <path d="m1 1 22 22" />
    </Icon>
  );
}

/** Smartphone — devices / active sessions. */
export function SmartphoneIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="6" y="2" width="12" height="20" rx="2.5" />
      <path d="M11 18h2" />
    </Icon>
  );
}

/* ── External / social (instance-platform-info) ──────────────────────────── */

/** Website / external presence — feather globe (MIT, credited in the header). */
export function GlobeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </Icon>
  );
}

/*
 * Brand marks (Mastodon / X / Bluesky) for the /about social-links row. These
 * are FILLED logo glyphs, not feather strokes: paths are vendored verbatim from
 * Simple Icons (https://simpleicons.org, CC0), 24×24 viewBox, and follow the
 * set's filled-by-design convention (`fill="currentColor" stroke="none"` on the
 * path, outline default overridden). Same a11y contract as every icon here.
 */

/** Mastodon brand mark (Simple Icons, CC0). */
export function MastodonIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M23.268 5.313c-.35-2.578-2.617-4.61-5.304-5.004C17.51.242 15.792 0 11.813 0h-.03c-3.98 0-4.835.242-5.288.309C3.882.692 1.496 2.518.917 5.127.64 6.412.61 7.837.661 9.143c.074 1.874.088 3.745.26 5.611.118 1.24.325 2.47.62 3.68.55 2.237 2.777 4.098 4.96 4.857 2.336.792 4.849.923 7.256.38.265-.061.527-.132.786-.213.585-.184 1.27-.39 1.774-.753a.057.057 0 0 0 .023-.043v-1.809a.052.052 0 0 0-.02-.041.053.053 0 0 0-.046-.01 20.282 20.282 0 0 1-4.709.545c-2.73 0-3.463-1.284-3.674-1.818a5.593 5.593 0 0 1-.319-1.433.053.053 0 0 1 .066-.054c1.517.363 3.072.546 4.632.546.376 0 .75 0 1.125-.01 1.57-.044 3.224-.124 4.768-.422.038-.008.077-.015.11-.024 2.435-.464 4.753-1.92 4.989-5.604.008-.145.03-1.52.03-1.67.002-.512.167-3.63-.024-5.545zm-3.748 9.195h-2.561V8.29c0-1.309-.55-1.976-1.67-1.976-1.23 0-1.846.79-1.846 2.35v3.403h-2.546V8.663c0-1.56-.617-2.35-1.848-2.35-1.112 0-1.668.668-1.67 1.977v6.218H4.822V8.102c0-1.31.337-2.35 1.011-3.12.696-.77 1.608-1.164 2.74-1.164 1.311 0 2.302.5 2.962 1.498l.638 1.06.638-1.06c.66-.999 1.65-1.498 2.96-1.498 1.13 0 2.043.395 2.74 1.164.675.77 1.012 1.81 1.012 3.12z"
        fill="currentColor"
        stroke="none"
      />
    </Icon>
  );
}

/** X (formerly Twitter) brand mark (Simple Icons, CC0). Distinct from CloseIcon. */
export function XIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"
        fill="currentColor"
        stroke="none"
      />
    </Icon>
  );
}

/** Bluesky butterfly brand mark (Simple Icons, CC0). */
export function BlueskyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8Z"
        fill="currentColor"
        stroke="none"
      />
    </Icon>
  );
}

/* ── IPFS ────────────────────────────────────────────────────────────────── */

/**
 * IPFS cube — the ONE non-24 icon (viewBox 0 0 12 14, ~10×11 render, sw 1.4).
 * Kept separate from the shared <Icon> wrapper because of its distinct viewBox
 * and aspect ratio; same a11y contract (decorative by default; `label` → img).
 */
export function SettingsIcon(props: IconProps) {
  return <Icon {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></Icon>;
}

export function KeyboardIcon(props: IconProps) {
  return <Icon {...props}><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10h.01M11 10h.01M15 10h.01M18 10h.01M7 14h.01M10 14h7" /></Icon>;
}

export function LogOutIcon(props: IconProps) {
  return <Icon {...props}><path d="M10 17l5-5-5-5M15 12H3M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /></Icon>;
}

export function MonitorIcon(props: IconProps) {
  return <Icon {...props}><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M8 22h8M12 18v4" /></Icon>;
}

export function IpfsIcon({
  size = 12,
  strokeWidth = 1.4,
  label,
  ...rest
}: IconProps) {
  const height = size;
  const width = Math.round((size * 12) / 14);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 12 14"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      {...rest}
    >
      {label ? <title>{label}</title> : null}
      <path d="M6 1l5 3v6l-5 3-5-3V4z" />
      <path d="M6 7l5-3M6 7L1 4M6 7v6" />
    </svg>
  );
}
