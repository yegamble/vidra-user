import type { MetadataRoute } from "next";

import { getInstanceConfig } from "@/lib/instance-config.server";
import { buildWebManifest } from "@/lib/layout-metadata";

// Web app manifest (Wave F PWA floor). Next serves this at /manifest.webmanifest
// and injects the <link rel="manifest"> automatically. NO service worker this
// session — installability here is manifest + icons + theme-color only (the SW /
// web-push story lands with the notification work).
//
// The naming logic lives in lib/layout-metadata (buildWebManifest), beside the
// root <title> it must agree with. It used to be a STATIC export naming the
// product unconditionally: an operator rename showed in the tab title while the
// INSTALL name stayed "Vidra". That was a cosmetic mismatch until the
// white-label switch, at which point the manifest became a leak the operator
// cannot close — both the installed app's name and the manifest JSON itself are
// public.
//
// force-dynamic, not prerendered: a build-time render has no backend to ask, so
// a prerendered manifest would serve the fallback name to every visitor. The
// instance read is still cheap — getInstanceConfig() carries its own explicit
// `next: { revalidate: 60 }`, so the document is fetched about once a minute
// rather than once per request.
export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  return buildWebManifest(await getInstanceConfig());
}
