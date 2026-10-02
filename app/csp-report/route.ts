import { logger } from "@/lib/logger";

// The CSP violation sink (report-uri + Reporting-Endpoints in
// lib/security-headers.ts). It is unauthenticated by nature — browsers post
// here with no credentials — so it trusts nothing it receives:
//   - the body is capped at 8 KiB and read no further, so a large POST costs
//     nothing but the bytes up to the cap;
//   - lines are capped per process per minute, so a flood cannot fill the logs;
//   - a report's URLs are reduced to an ORIGIN (blocked resource) and a PATH
//     (document), because query strings and fragments carry reset/verify tokens.
// Both formats arrive: the legacy `application/csp-report` object from
// report-uri, and `application/reports+json` arrays from report-to.
// Not under /api/: in the single-origin topology Caddy routes /api/* to vidra-core.

const MAX_BODY_BYTES = 8 * 1024;
const MAX_LINES_PER_MINUTE = 100;
let budget = { windowStart: 0, used: 0 };

/** Test seam: the per-minute line budget is module state. */
export function resetCspReportBudget() {
  budget = { windowStart: 0, used: 0 };
}

function takeBudget(): boolean {
  const now = Date.now();
  if (now - budget.windowStart >= 60_000) budget = { windowStart: now, used: 0 };
  return budget.used++ < MAX_LINES_PER_MINUTE;
}

async function readCapped(request: Request): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const str = (value: unknown) => (typeof value === "string" ? value.slice(0, 200) : undefined);

// Keyword sources ("inline", "eval", "wasm-eval", "data", "blob") stay as-is.
function originOnly(value: unknown): string | undefined {
  const raw = str(value);
  if (!raw) return undefined;
  if (/^[a-z-]+$/.test(raw)) return raw;
  try {
    const url = new URL(raw);
    return url.origin === "null" ? `${url.protocol}` : url.origin;
  } catch {
    return "unparseable";
  }
}

function pathOnly(value: unknown): string | undefined {
  try {
    return new URL(String(value)).pathname.slice(0, 200);
  } catch {
    return undefined;
  }
}

type Violation = { directive?: string; blocked?: string; document?: string; disposition?: string };

function violations(payload: unknown): Violation[] {
  if (Array.isArray(payload)) {
    return payload
      .filter((r) => r?.type === "csp-violation" && r.body && typeof r.body === "object")
      .map(({ body }) => ({
        directive: str(body.effectiveDirective),
        blocked: originOnly(body.blockedURL),
        document: pathOnly(body.documentURL),
        disposition: str(body.disposition),
      }));
  }
  const legacy = (payload as Record<string, unknown> | null)?.["csp-report"];
  if (!legacy || typeof legacy !== "object") return [];
  const r = legacy as Record<string, unknown>;
  return [
    {
      directive: str(r["effective-directive"] ?? r["violated-directive"]),
      blocked: originOnly(r["blocked-uri"]),
      document: pathOnly(r["document-uri"]),
      disposition: str(r.disposition),
    },
  ];
}

export async function POST(request: Request): Promise<Response> {
  const body = await readCapped(request);
  if (body === null) return new Response(null, { status: 413 });
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response(null, { status: 204 });
  }
  for (const violation of violations(payload)) {
    if (!takeBudget()) break;
    logger.warn("csp violation", violation);
  }
  return new Response(null, { status: 204 });
}
