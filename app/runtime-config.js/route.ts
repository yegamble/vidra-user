import { apiBaseUrl } from "@/lib/config";

// Runtime browser config (the Phase 1 no-fork blocker): the root layout loads
// this script beforeInteractive, so the browser learns the API origin from the
// RUNNING server's environment (PUBLIC_API_BASE_URL, "" = same-origin) instead
// of from a value `next build` froze into the client bundle. force-dynamic is
// load-bearing: a statically generated body would bake the builder's env into
// the image — exactly the trap this route exists to avoid. Statically
// prerendered pages reference the script by URL, so even they pick up the
// runtime value.
export const dynamic = "force-dynamic";

export function GET(): Response {
  // JSON.stringify so an operator-supplied env value can never break out of
  // the script context.
  const body = `self.__VIDRA_RUNTIME_CONFIG__=${JSON.stringify({ apiBaseUrl })};`;
  return new Response(body, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      // Per-deployment constant, so cacheable — but briefly, matching the
      // instance-config window, so a repointed deployment converges fast.
      "cache-control": "public, max-age=60",
    },
  });
}
