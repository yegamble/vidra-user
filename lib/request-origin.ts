import { headers } from "next/headers";

// The public web origin of THIS request (scheme + host), derived from the
// incoming request headers. Used to build the canonical watch URL that the
// oembed discovery link advertises (Wave F F3) — there is no separate frontend
// origin knob, and the backend validates the URL against its own configured web
// origin, so the two agree in a real deployment. Returns null when the host is
// unknown (never throws; callers omit the discovery link rather than emit a
// bogus URL).
export async function getRequestOrigin(): Promise<string | null> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (!host) return null;
    const forwardedProto = h.get("x-forwarded-proto");
    const proto = forwardedProto ?? (isLocalHost(host) ? "http" : "https");
    return `${proto}://${host}`;
  } catch {
    return null;
  }
}

function isLocalHost(host: string): boolean {
  return host.startsWith("localhost") || host.startsWith("127.") || host.startsWith("[::1]");
}
