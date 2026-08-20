// The one response header that cannot be a build-time constant.
//
// Every other hardening header lives in next.config's headers() (see
// lib/security-headers.ts), which Next evaluates when the image is BUILT.
// Strict-Transport-Security cannot: whether this instance may advertise HSTS at
// all depends on how the operator terminates TLS, and the same generic image
// serves an acme/external-proxy deployment (https, HSTS on) and the deliberate
// plain-http mode for labs, LANs and air-gapped installs (HSTS off — it would
// pin a scheme the instance does not speak). Middleware runs per request, so it
// can read PUBLIC_BASE_URL from the container's environment at request time.

import { NextResponse } from "next/server";

import { STRICT_TRANSPORT_SECURITY, shouldSendHsts } from "@/lib/security-headers";

export function middleware() {
  const response = NextResponse.next();
  if (shouldSendHsts(process.env.PUBLIC_BASE_URL)) {
    response.headers.set(STRICT_TRANSPORT_SECURITY.key, STRICT_TRANSPORT_SECURITY.value);
  }
  return response;
}

// Same source pattern as the next.config headers() rule this took over from, so
// the header keeps reaching every route it used to — /embed and the static
// asset paths included.
export const config = {
  matcher: "/:path*",
};
