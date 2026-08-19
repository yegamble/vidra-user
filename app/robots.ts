import type { MetadataRoute } from "next";

import { apiBaseUrl } from "@/lib/config";
import { getRequestOrigin } from "@/lib/request-origin";

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
// /sitemap.xml to the api) the site origin IS the API origin, which is the only
// form search engines honour without cross-host verification. With the
// runtime-generic image the configured base is same-origin relative (""), so
// the absolute URL is derived from the request's own Host per render —
// force-dynamic is load-bearing: a statically generated robots.txt would
// freeze the builder's env ("") into every deployment.
//
// Note the backend gates /sitemap.xml on PUBLIC_BASE_URL — with that unset the
// URL below 404s. That is an operator misconfiguration to catch at deploy time
// (the launch checklist sets PUBLIC_BASE_URL), not something this route can
// detect.
export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = apiBaseUrl !== "" ? apiBaseUrl : await getRequestOrigin();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Prefix match: "/studio" also covers "/studio/content" etc.
      disallow: PRIVATE_SURFACES,
    },
    // Falls back to a relative path when even the request host is unknown —
    // nonstandard, but strictly better than emitting a bogus absolute URL.
    sitemap: `${origin ?? ""}/sitemap.xml`,
  };
}
