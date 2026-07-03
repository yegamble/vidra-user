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
      <p role="alert" className="text-sm text-zinc-600 dark:text-zinc-400">
        The QR code could not be generated — enter the secret manually instead.
      </p>
    );
  }

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`${-QUIET_ZONE} ${-QUIET_ZONE} ${encoded.span} ${encoded.span}`}
      // The quiet zone must stay light in dark mode too — scanners need it.
      className={`h-44 w-44 rounded-md bg-white ${className}`}
      shapeRendering="crispEdges"
    >
      <path d={encoded.path} fill="#18181b" />
    </svg>
  );
}
