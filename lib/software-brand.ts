// White-label seam: the ONE place that decides whether this deployment may say
// the software's name out loud.
//
// An instance admin can turn `branding_hide_software_name` on (General →
// Branding) to strip "Vidra" and every "Powered by Vidra" attribution from
// PUBLIC and SIGNED-IN surfaces — page titles, the PWA manifest, the auth
// screens, the About page, downloaded filenames, prose. Machine-readable
// identifiers are deliberately out of scope and never move: NodeInfo, /version,
// cookie and header names (`X-Vidra-*`), localStorage keys, the `vidra_export`
// archive envelope, the OTel service name. A white label is a presentation
// choice, not a protocol fork — renaming an identifier would break federation
// peers, importers, and every stored client value.
//
// Pure and SERVER-SAFE on purpose (no "use client", no React): server
// components and metadata builders read these helpers directly from the RSC
// instance snapshot, while client components reach the same answer through
// components/SoftwareBrandProvider.tsx, which is wired once in app/layout.tsx.
//
// DEFAULT IS SHOW. A null snapshot means the backend could not be read (it is
// starting, it is unreachable, or — the case that keeps the mocked Playwright
// suite honest — there is no backend at all). "Could not ask" is not evidence
// that an operator wants white-labelling, and failing toward hiding would blank
// out brand slots on every instance that never touched the setting.

/** The software's own name. The only literal "Vidra" a user-facing surface may render. */
export const SOFTWARE_NAME = "Vidra";

/**
 * Prose subject for sentences that would otherwise name the software
 * ("Vidra never holds funds" → "This platform never holds funds").
 */
export const NEUTRAL_PLATFORM_LABEL = "This platform";

/**
 * A BRAND SLOT that must never render empty — the header wordmark and the auth
 * wordmark, both of which are links to "/". Used only in the degenerate case
 * (hidden AND the operator set no instance name): "Home" is the honest
 * accessible name for that link, where a blank would break the header's
 * "never renders an empty header" guarantee.
 */
export const NEUTRAL_BRAND_FALLBACK = "Home";

/**
 * A DOCUMENT/APP NAME slot — the root <title> and the PWA manifest name — in
 * the same degenerate case. A distinct constant from the brand slot because
 * grammar differs: a tab and an installed app are named, not navigated to.
 */
export const NEUTRAL_SITE_TITLE = "Video";

/** The metadata description floor when the software's own tagline may not be said. */
export const NEUTRAL_DESCRIPTION = "A video platform.";

/**
 * The shape every caller has in common: the public /instance document (the RSC
 * snapshot, the client-side cached read, or the About page's own copy). Kept
 * structural rather than importing InstanceConfigSnapshot so this module stays
 * free of the server-only module graph.
 */
export type SoftwareBrandSource = {
  branding?: { hide_software_name?: boolean } | undefined;
} | null | undefined;

/**
 * Whether this instance has asked to be white-labelled. True ONLY on an
 * explicit `true` — see the DEFAULT IS SHOW note above.
 */
export function hideSoftwareName(instance: SoftwareBrandSource): boolean {
  return instance?.branding?.hide_software_name === true;
}

/** The software name to render, or null when this instance is white-labelled. */
export function softwareName(instance: SoftwareBrandSource): string | null {
  return hideSoftwareName(instance) ? null : SOFTWARE_NAME;
}

/** The prose subject for a sentence about the platform. */
export function platformLabel(hidden: boolean): string {
  return hidden ? NEUTRAL_PLATFORM_LABEL : SOFTWARE_NAME;
}

/**
 * The name to put in a brand slot: the instance's own name, else the software
 * name — and NOTHING when white-labelled. Returning null rather than a filler
 * is deliberate: each slot picks its own neutral wording (a link says "Home", a
 * title says "Video", a sentence drops the clause entirely), and a single
 * shared filler would read wrong in at least one of them.
 */
export function brandName(
  instanceName: string | null | undefined,
  hidden: boolean,
): string | null {
  const trimmed = typeof instanceName === "string" ? instanceName.trim() : "";
  if (trimmed !== "") return trimmed;
  return hidden ? null : SOFTWARE_NAME;
}
