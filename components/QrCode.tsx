"use client";

import { useMemo } from "react";

import { encodeQr, qrSvgPath } from "@/lib/qr";

// QrCode renders a value as a crisp inline-SVG QR symbol (dependency-free
// encoder, lib/qr.ts) with the spec's 4-module quiet zone. Used for the TOTP
// otpauth:// provisioning URI on /settings/security. The SVG is an image with
// an accessible name; the value itself is NEVER exposed in the DOM as text by
// this component (the caller decides how to show the secret).
const QUIET_ZONE = 4;

export function QrCode({
  value,
  label,
  className = "",
}: {
  value: string;
  /** Accessible name for the rendered image. */
  label: string;
  className?: string;
}) {
  const encoded = useMemo(() => {
    try {
      const modules = encodeQr(value);
      return { path: qrSvgPath(modules), span: modules.length + QUIET_ZONE * 2 };
    } catch {
      return null; // payload too long — the caller's copyable fallback remains
    }
  }, [value]);

  if (!encoded) {
    return (
      <p role="alert" className="text-sm text-fg-muted">
        The QR code could not be generated — enter the secret manually instead.
      </p>
    );
  }

  // QR codes are a documented theming exception: always dark modules on a
  // white padded tile, in both schemes — scanners need the contrast.
  return (
    <div className="inline-flex shrink-0 rounded-xl bg-white p-2">
      <svg
        role="img"
        aria-label={label}
        viewBox={`${-QUIET_ZONE} ${-QUIET_ZONE} ${encoded.span} ${encoded.span}`}
        // The quiet zone must stay light in dark mode too — scanners need it.
        className={`h-40 w-40 ${className}`}
        shapeRendering="crispEdges"
      >
        <path d={encoded.path} fill="#18181b" />
      </svg>
    </div>
  );
}
