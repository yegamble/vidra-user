// Server-side fetch of the admin-authored homepage document (config-parity
// W6; contract: GET /api/v1/instance/homepage → {"body": raw markdown,
// "hash"} — 404 while no homepage is set). Consumed only by the '/' landing
// branch in app/page.tsx when defaults.landing_page === "home" and
// homepage.enabled; rendering/sanitisation stays the client's job (the one
// components/Markdown.tsx pipeline).
//
// Same posture as lib/instance-config.server.ts: never throws — any failure
// (backend down, 404 while unset, non-JSON) resolves to null and the caller
// falls back to the home-recent feed, so the homepage option is never a
// blank-page dead end.

import { cache } from "react";

import { INSTANCE_CONFIG_REVALIDATE_SECONDS } from "@/lib/instance-config.server";
import { serverJson } from "@/lib/server-json";

export type InstanceHomepageDocument = {
  /** Raw markdown. */
  body: string;
  hash: string;
};

/**
 * Fetch the homepage document server-side. React cache() deduplicates within
 * one render pass; the Next data cache revalidates every ~60s (matching the
 * /instance snapshot window, so the enabled flag and the body stay roughly in
 * step). Null when unset, empty, or unreachable.
 */
export const getInstanceHomepage = cache(async (): Promise<InstanceHomepageDocument | null> => {
  const doc = await serverJson<Partial<InstanceHomepageDocument>>("/api/v1/instance/homepage", {
    freshness: { revalidateSeconds: INSTANCE_CONFIG_REVALIDATE_SECONDS },
  });
  // An empty body is a homepage that was never written — not a document.
  if (!doc || typeof doc.body !== "string" || doc.body.trim() === "") return null;
  return { body: doc.body, hash: typeof doc.hash === "string" ? doc.hash : "" };
});
