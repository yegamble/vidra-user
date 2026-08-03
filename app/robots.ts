import type { MetadataRoute } from "next";

import { apiBaseUrl } from "@/lib/config";

// Every one of these is an authenticated surface: it renders a shell, fetches
// in the browser with a bearer token, and shows a signed-out viewer nothing.
// Crawling them costs the instance a render each and yields duplicate, empty
// pages, so keep them out of the index. This is a crawl directive, not access
// control — the real gate is that the backend refuses the data.
//
// Verified against the app router (`ls app/`): the six named in the launch plan
// plus /moderation and /notifications, which are the same class of route and
// were simply not enumerated there. Public surfaces — /videos, /channels,
// /users, /playlists, /live, /remote, /search, /trending, /about, /embed —
// stay crawlable.
const PRIVATE_SURFACES = [
  "/admin",
  "/history",
  "/library",
  "/messages",
  "/moderation",
  "/notifications",
  "/settings",
  "/studio",
];

// The sitemap is served by vidra-core, not by this app — there is no
// app/sitemap.ts. Under the single-domain topology (one origin, Caddy routing
// /sitemap.xml to the api) NEXT_PUBLIC_API_BASE_URL *is* the site origin, so
// this resolves same-host, which is the only form search engines honour without
// cross-host verification. Build-time constant on purpose: keeping robots.txt a
// static route means it never costs a render.
//
// Note the backend gates /sitemap.xml on PUBLIC_BASE_URL — with that unset the
// URL below 404s. That is an operator misconfiguration to catch at deploy time
// (the launch checklist sets PUBLIC_BASE_URL), not something this route can
// detect.
const SITEMAP_URL = `${apiBaseUrl}/sitemap.xml`;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Prefix match: "/studio" also covers "/studio/content" etc.
      disallow: PRIVATE_SURFACES,
    },
    sitemap: SITEMAP_URL,
  };
}
