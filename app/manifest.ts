import type { MetadataRoute } from "next";

import { FALLBACK_DESCRIPTION, FALLBACK_TITLE } from "@/lib/layout-metadata";

// Web app manifest (Wave F PWA floor). Next serves this at /manifest.webmanifest
// and injects the <link rel="manifest"> automatically. NO service worker this
// session — installability here is manifest + icons + theme-color only (the SW /
// web-push story lands with the notification work).
//
// Naming reuses the built-in fallback identity (lib/layout-metadata) — the same
// "Vidra" the root <title> falls back to. The manifest is a static route, so it
// cannot read the per-request instance snapshot the way generateMetadata does;
// an operator rename shows in the tab title/branding, while the install name
// stays the product default. theme_color mirrors the light theme-color emitted
// by the root viewport (app/layout.tsx); background_color is the light canvas
// token (--canvas in app/globals.css) for a flash-free splash.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: FALLBACK_TITLE,
    short_name: FALLBACK_TITLE,
    description: FALLBACK_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#f5f5f7",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
