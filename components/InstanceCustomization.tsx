import type { InstanceConfigSnapshot } from "@/lib/instance-config.server";
import { apiBaseUrl } from "@/lib/config";

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
// theme_primary_color (customization.primary_color) is W6 work and is
// deliberately NOT injected here yet — it is design-gated on the WCAG
// contrast guard.

const HEX_HASH = /^[0-9a-f]{8,128}$/i;

export function InstanceCustomization({ instance }: { instance: InstanceConfigSnapshot | null }) {
  const customization = instance?.customization;
  const cssHash = customization?.css_hash;
  const jsHash = customization?.js_hash;
  const css = cssHash && HEX_HASH.test(cssHash) ? cssHash : null;
  const js = jsHash && HEX_HASH.test(jsHash) ? jsHash : null;
  if (!css && !js) return null;
  return (
    <>
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
