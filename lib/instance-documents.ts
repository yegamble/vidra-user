// Instance-document editor helpers (config-parity W6 over the W1 store; see
// .ralph/specs/config-parity/instance-contract.md "Documents"). Pure module —
// shared by the admin editors and unit-testable in isolation.

import type { InstanceDocumentName } from "@/lib/api";

/**
 * Per-document body byte caps, mirroring vidra-core's store exactly
 * (internal/instancedocs: homepage 100 KiB, custom CSS/JS 200 KiB). The
 * backend measures UTF-8 BYTES, so the counter here does too.
 */
export const INSTANCE_DOCUMENT_CAPS: Record<InstanceDocumentName, number> = {
  homepage: 100 << 10,
  custom_css: 200 << 10,
  custom_js: 200 << 10,
};

/** UTF-8 byte length of a document body — the unit the backend caps. */
export function documentByteSize(body: string): number {
  return new TextEncoder().encode(body).length;
}

/** "12.3 KB of 100 KB" — the live size-counter line for a document editor. */
export function describeDocumentSize(body: string, cap: number): string {
  const bytes = documentByteSize(body);
  const toKB = (n: number) => {
    const kb = n / 1024;
    return `${kb >= 100 || Number.isInteger(kb) ? Math.round(kb) : kb.toFixed(1)} KB`;
  };
  return `${toKB(bytes)} of ${toKB(cap)}`;
}

/** True when the body exceeds its cap (the editor blocks saving then). */
export function isDocumentOverCap(body: string, cap: number): boolean {
  return documentByteSize(body) > cap;
}

/**
 * The typed-confirmation phrase gating a custom-JavaScript save (architecture
 * note 6: XSS-as-a-feature needs a loud, deliberate gate). The user must type
 * this exact phrase before the save is allowed.
 */
export const CUSTOM_JS_CONFIRM_PHRASE = "run this code";
