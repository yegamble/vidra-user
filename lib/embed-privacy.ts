// Pure helpers for the CORE-17 embed-privacy enforcement that lives on the embed
// page (the server only stores/serves the policy — see the openapi note). Kept
// framework-free so the branching is unit-tested directly.

import type { EmbedPrivacyStatus } from "@/lib/api";

/** What the embed page should render for a policy in a given framing context. */
export type EmbedDecision = "allow" | "disabled" | "blocked";

export interface EmbedContext {
  /** True when /embed is opened at the top level (not inside an iframe). */
  isTopLevel: boolean;
  /** window.location.ancestorOrigins entries (ancestor frame ORIGINS), if any. */
  ancestorOrigins: string[];
  /** document.referrer (a full URL), or "" when absent. */
  referrer: string;
}

/**
 * hostOf extracts the bare, lowercased hostname from an origin/URL string
 * ("https://blog.example.com:8443/x" → "blog.example.com"), or null when the
 * value is not a parseable absolute URL. Bare hostnames (no scheme/port/path)
 * are what the whitelist stores and what we compare against.
 */
export function hostOf(value: string): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * embedContextHosts is the set of candidate hostnames the current framing
 * exposes: the immediate ancestor origin's host (the site doing the embedding)
 * plus the referrer host as a fallback for browsers without ancestorOrigins
 * (Firefox). Deduped, lowercased, parseable-only.
 */
export function embedContextHosts(ctx: EmbedContext): string[] {
  const hosts = new Set<string>();
  for (const origin of ctx.ancestorOrigins) {
    const h = hostOf(origin);
    if (h) hosts.add(h);
  }
  const refHost = hostOf(ctx.referrer);
  if (refHost) hosts.add(refHost);
  return [...hosts];
}

/**
 * decideEmbed maps an embed-privacy policy + the current framing to what the
 * embed page should show:
 *  - "disabled"  → embedding is turned off for this video;
 *  - "allow"     → play (enabled tier; or a direct top-level open of /embed,
 *                  which is always permitted; or a whitelisted embedding host);
 *  - "blocked"   → whitelist tier and no framing host matched the allow-list.
 * Enforcement is best-effort client-side (referrer/ancestor-origin can be
 * spoofed by a determined embedder) — the honest guard the design calls for.
 */
export function decideEmbed(
  policy: { status: EmbedPrivacyStatus; allowed_domains?: string[] },
  ctx: EmbedContext,
): EmbedDecision {
  if (policy.status === "disabled") return "disabled";
  if (policy.status === "enabled") return "allow";
  // whitelist: a direct top-level open (no embedding ancestor) is allowed.
  if (ctx.isTopLevel) return "allow";
  const allowed = new Set((policy.allowed_domains ?? []).map((d) => d.toLowerCase()));
  return embedContextHosts(ctx).some((h) => allowed.has(h)) ? "allow" : "blocked";
}

/**
 * normalizeDomain validates one allow-list entry the way the backend does: a
 * BARE hostname — no scheme, port, path, whitespace, or wildcard. Trims and
 * lowercases; returns null for anything that is not a plain hostname so the
 * studio editor can reject it before the PUT (which would otherwise 400).
 */
export function normalizeDomain(input: string): string | null {
  const host = input.trim().toLowerCase();
  if (host === "") return null;
  // Reject a scheme, port, path, query, credentials, or whitespace — bare host only.
  if (/[\s/:?#@]/.test(host)) return null;
  // A hostname is dot-separated labels of letters/digits/hyphens (no leading/
  // trailing hyphen per label). Rejects wildcards and empty labels.
  const label = "[a-z0-9](?:[a-z0-9-]*[a-z0-9])?";
  if (!new RegExp(`^${label}(?:\\.${label})*$`).test(host)) return null;
  return host;
}
