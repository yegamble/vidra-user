// The response headers that cannot be build-time constants.
//
// Content-Security-Policy carries a fresh script nonce per request (the Next CSP
// guide's pattern): Next reads it from the REQUEST policy header for its own
// scripts, and x-nonce hands it to ours. Both overwrite anything client-sent.
//
// Every other hardening header lives in next.config's headers() (see
// lib/security-headers.ts), which Next evaluates when the image is BUILT.
// Strict-Transport-Security cannot: whether this instance may advertise HSTS at
// all depends on how the operator terminates TLS, and the same generic image
// serves an acme/external-proxy deployment (https, HSTS on) and the deliberate
// plain-http mode for labs, LANs and air-gapped installs (HSTS off — it would
// pin a scheme the instance does not speak). This file runs per request, so it
// can read PUBLIC_BASE_URL from the container's environment at request time.
//
// "proxy" is Next 16's name for what used to be middleware.ts (that convention
// now warns as deprecated on every build). Besides the name, proxy always runs
// on the Node.js runtime rather than the edge sandbox — which is what makes the
// environment read above plain process.env rather than a runtime-specific quirk.

import { NextResponse, type NextRequest } from "next/server";

import { apiBaseUrl } from "@/lib/config";
import {
  STRICT_TRANSPORT_SECURITY,
  apiOriginOf,
  buildContentSecurityPolicy,
  cspHeaderName,
  shouldSendHsts,
} from "@/lib/security-headers";

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const { pathname } = request.nextUrl;
  const policy = buildContentSecurityPolicy({
    nonce,
    apiOrigin: apiOriginOf(apiBaseUrl),
    frameable: pathname === "/embed" || pathname.startsWith("/embed/"),
    isDev: process.env.NODE_ENV === "development",
  });
  const header = cspHeaderName(process.env.CSP_REPORT_ONLY);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(header, policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(header, policy);
  if (shouldSendHsts(process.env.PUBLIC_BASE_URL)) {
    response.headers.set(STRICT_TRANSPORT_SECURITY.key, STRICT_TRANSPORT_SECURITY.value);
  }
  return response;
}

// Same source pattern as the next.config headers() rule this took over from, so
// HSTS keeps reaching every route it used to — /embed and the static asset paths
// included. The docs suggest skipping static assets for the CSP; a policy on a
// .js file is inert, and one matcher keeps the x-nonce overwrite universal.
export const config = {
  matcher: "/:path*",
};
