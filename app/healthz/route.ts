// Container healthcheck + deploy-probe target, dialed at 127.0.0.1:3000 from
// INSIDE the container. It imports NOTHING on purpose: a route handler skips
// the root layout, so frontend health stops depending on the api being up. The
// old probe GET / did depend on it, transitively — the root layout and the home
// page both await getInstanceConfig(), which fetches vidra-core over
// INTERNAL_API_BASE_URL, so a degraded api (or merely a busy one, under
// transcode CPU load) marked the FRONTEND unhealthy. Keep this file free of
// imports and of anything that fetches.
//
// Known and accepted: at the PUBLIC edge, deploy/Caddyfile routes /healthz to
// the api service, so this route is only ever reachable container-internally.
// force-dynamic matches the repo's other route handler — a probe must report
// the running server, never a body baked at build time.
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({ status: "ok" });
}
