import type { InstanceConfigSnapshot } from "@/lib/instance-config.server";
import { apiBaseUrl } from "@/lib/config";
import { buildAccentOverrideCss } from "@/lib/contrast";

// InstanceCustomization is the root-layout CSS/JS injection point
// (config-parity W2 seam; posture per architecture note 6). The admin-authored
// documents are delivered as EXTERNAL files served by vidra-core — never
// inlined — with the content hash as the cache-busting query param:
//
//   <link rel="stylesheet" href=".../instance/custom.css?v={css_hash}">
//   <script defer src=".../instance/custom.js?v={js_hash}">
//
// Nothing renders until the matching customization hash exists on the
// /instance snapshot (W1 serves the hashes, W6 ships the editors). Hashes are
// validated to hex before use so a malformed backend value can never produce a
// surprising URL. React hoists these tags into <head> from the layout body.
//
// theme_primary_color (customization.primary_color, config-parity W6) rides
// the same seam: when a strictly-valid #rrggbb color is set, a tiny inline
// stylesheet overrides the --accent TOKEN PAIR (--accent + its computed
// --accent-fg label ink — lib/contrast.ts), never individual rules, so every
// bg-accent/text-accent-fg call site follows in both themes. It is part of
// the server-rendered HTML (this component renders in the layout before the
// app shell), so the override applies before first paint — no accent flash.
// buildAccentOverrideCss returns null for anything that is not #rrggbb, so a
// malformed backend value can never inject CSS.

const HEX_HASH = /^[0-9a-f]{8,128}$/i;

export function InstanceCustomization({ instance }: { instance: InstanceConfigSnapshot | null }) {
  const customization = instance?.customization;
  const cssHash = customization?.css_hash;
  const jsHash = customization?.js_hash;
  const css = cssHash && HEX_HASH.test(cssHash) ? cssHash : null;
  const js = jsHash && HEX_HASH.test(jsHash) ? jsHash : null;
  const accentCss = buildAccentOverrideCss(customization?.primary_color ?? "");
  if (!css && !js && !accentCss) return null;
  return (
    <>
      {accentCss ? <style data-testid="accent-override">{accentCss}</style> : null}
      {css ? (
        <link
          rel="stylesheet"
          // precedence opts into React 19 hoisting (into <head>, after the
          // app's own styles so admin CSS wins ties the way PeerTube's does).
          precedence="low"
          href={`${apiBaseUrl}/api/v1/instance/custom.css?v=${css}`}
        />
      ) : null}
      {js ? <script defer src={`${apiBaseUrl}/api/v1/instance/custom.js?v=${js}`} /> : null}
    </>
  );
}
