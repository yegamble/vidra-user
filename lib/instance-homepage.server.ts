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

import { internalApiBaseUrl } from "@/lib/config";
import { INSTANCE_CONFIG_REVALIDATE_SECONDS } from "@/lib/instance-config.server";

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
  try {
    const res = await fetch(`${internalApiBaseUrl}/api/v1/instance/homepage`, {
      headers: { Accept: "application/json" },
      next: { revalidate: INSTANCE_CONFIG_REVALIDATE_SECONDS },
    });
    if (!res.ok) return null;
    const doc = (await res.json()) as Partial<InstanceHomepageDocument>;
    if (typeof doc.body !== "string" || doc.body.trim() === "") return null;
    return { body: doc.body, hash: typeof doc.hash === "string" ? doc.hash : "" };
  } catch {
    return null;
  }
});
