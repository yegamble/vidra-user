"use client";

import { useEffect, useRef, useState } from "react";

import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { InstanceLogoType } from "@/lib/api";
import {
  BRANDING_IMAGE_ACCEPT,
  brandingAssetUrl,
  validateBrandingImage,
} from "@/lib/branding";
import type { BrandingAsset, InstanceBrandingBlock } from "@/lib/instance-config.server";

// InstanceBrandingManager — the admin branding-assets panel on the General
// config page (config-parity W4). The six slots (avatar, banner, favicon,
// header-wide, header-square, opengraph) are NOT registry keys: each uploads
// through its dedicated W1 admin endpoint (multipart POST) and clears with a
// confirmed DELETE, mirroring PeerTube's asset API. State comes from the
// public GET /instance branding block ({url, is_fallback} per slot) and is
// re-read after every change; a slot at is_fallback shows an honest
// "built-in default" note instead of a preview. Picked files are validated
// inline (JPEG/PNG/WebP, ≤ 8 MiB — lib/branding.ts mirrors the backend gates)
// before any request. Styling follows the ConfigForm grouped-inset idiom;
// the component renders INSIDE the General page's Branding section, so it is
// already behind the admin RoleGate.

type SlotId = "avatar" | "banner" | InstanceLogoType;

type SlotDef = {
  id: SlotId;
  label: string;
  help: string;
  /** Preview <img> classes — each slot renders at its natural shape. */
  previewClass: string;
  pick: (branding: InstanceBrandingBlock) => BrandingAsset | undefined;
  upload: (file: File) => Promise<unknown>;
  remove: () => Promise<void>;
};

const SLOTS: SlotDef[] = [
  {
    id: "avatar",
    label: "Avatar",
    help: "Represents this instance in compact placements and on the About page.",
    previewClass: "h-16 w-16 rounded-2xl object-cover",
    pick: (b) => b.avatar,
    upload: (f) => api.setInstanceAvatar(f),
    remove: () => api.deleteInstanceAvatar(),
  },
  {
    id: "banner",
    label: "Banner",
    help: "The wide image across the top of the About page.",
    previewClass: "aspect-[4/1] w-full max-w-md rounded-xl object-cover",
    pick: (b) => b.banner,
    upload: (f) => api.setInstanceBanner(f),
    remove: () => api.deleteInstanceBanner(),
  },
  {
    id: "favicon",
    label: "Favicon",
    help: "The browser-tab icon.",
    previewClass: "h-10 w-10 rounded-lg object-contain",
    pick: (b) => b.logos?.favicon,
    upload: (f) => api.setInstanceLogo("favicon", f),
    remove: () => api.deleteInstanceLogo("favicon"),
  },
  {
    id: "header-wide",
    label: "Header logo (wide)",
    help: "Shown in the header on larger screens — beside the instance name, or alone when the name is hidden (Customization → Header).",
    previewClass: "h-12 w-auto max-w-xs rounded-lg object-contain",
    pick: (b) => b.logos?.header_wide,
    upload: (f) => api.setInstanceLogo("header-wide", f),
    remove: () => api.deleteInstanceLogo("header-wide"),
  },
  {
    id: "header-square",
    label: "Header logo (square)",
    help: "The compact header mark on small screens.",
    previewClass: "h-12 w-12 rounded-lg object-contain",
    pick: (b) => b.logos?.header_square,
    upload: (f) => api.setInstanceLogo("header-square", f),
    remove: () => api.deleteInstanceLogo("header-square"),
  },
  {
    id: "opengraph",
    label: "Social card image",
    help: "The preview image links to this instance show when shared (og:image / twitter:image). A page with its own image, like a video, still wins.",
    previewClass: "aspect-[1.91/1] w-full max-w-sm rounded-xl object-cover",
    pick: (b) => b.logos?.opengraph,
    upload: (f) => api.setInstanceLogo("opengraph", f),
    remove: () => api.deleteInstanceLogo("opengraph"),
  },
];

type Status = "loading" | "error" | "ready";

export function InstanceBrandingManager() {
  const [status, setStatus] = useState<Status>("loading");
  // undefined = pre-W1 backend (no branding block): render the honest note.
  const [branding, setBranding] = useState<InstanceBrandingBlock | undefined>(undefined);
  const [busy, setBusy] = useState<SlotId | null>(null);
  const [errors, setErrors] = useState<Partial<Record<SlotId, string>>>({});
  // The slot whose Remove is awaiting its inline confirmation.
  const [confirming, setConfirming] = useState<SlotId | null>(null);
  // Per-slot cache-buster so a replaced image shows immediately.
  const [versions, setVersions] = useState<Partial<Record<SlotId, number>>>({});
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getInstance(controller.signal)
      .then((res) => {
        setBranding((res as { branding?: InstanceBrandingBlock }).branding);
        setStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, [reloadKey]);

  // Re-read the effective branding block after a change (fresh URLs +
  // is_fallback flags). Best-effort: a failed refresh keeps the stale view.
  async function refresh() {
    try {
      const res = await api.getInstance();
      setBranding((res as { branding?: InstanceBrandingBlock }).branding);
    } catch {
      // Keep showing the last known state.
    }
  }

  function setSlotError(id: SlotId, message: string | null) {
    setErrors((prev) => {
      if (message === null) {
        if (prev[id] === undefined) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: message };
    });
  }

  async function doUpload(slot: SlotDef, file: File) {
    const invalid = validateBrandingImage(file);
    if (invalid !== null) {
      setSlotError(slot.id, invalid);
      return;
    }
    setBusy(slot.id);
    setSlotError(slot.id, null);
    setConfirming(null);
    try {
      await slot.upload(file);
      setVersions((prev) => ({ ...prev, [slot.id]: (prev[slot.id] ?? 0) + 1 }));
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 415) {
        setSlotError(slot.id, "The image must be a JPEG, PNG, or WebP.");
      } else if (err instanceof ApiError && err.status === 413) {
        setSlotError(slot.id, "The image is too large for this server.");
      } else {
        setSlotError(slot.id, errorMessage(err, `Could not set the ${slot.label.toLowerCase()}.`));
      }
    } finally {
      setBusy(null);
    }
  }

  async function doRemove(slot: SlotDef) {
    setBusy(slot.id);
    setSlotError(slot.id, null);
    setConfirming(null);
    try {
      await slot.remove();
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // Already gone server-side — reflect that instead of erroring.
        await refresh();
      } else {
        setSlotError(
          slot.id,
          errorMessage(err, `Could not remove the ${slot.label.toLowerCase()}.`),
        );
      }
    } finally {
      setBusy(null);
    }
  }

  if (status === "loading") {
    return (
      <div className="flex justify-center rounded-2xl bg-surface-muted p-6">
        <Spinner label="Loading instance branding" />
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface-muted p-4">
        <p className="text-sm text-fg-muted">Could not load the instance branding.</p>
        <button
          type="button"
          onClick={() => {
            setStatus("loading");
            setReloadKey((k) => k + 1);
          }}
          className="focus-ring rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-fg hover:bg-surface-muted"
        >
          Retry
        </button>
      </div>
    );
  }
  if (branding === undefined) {
    return (
      <p className="rounded-2xl bg-surface-muted p-4 text-sm text-fg-muted">
        Instance branding is not supported by this server yet.
      </p>
    );
  }

  return (
    <div
      role="group"
      aria-label="Branding assets"
      className="flex min-w-0 flex-col divide-y divide-border-subtle rounded-2xl bg-surface-muted p-4"
    >
      {SLOTS.map((slot) => (
        <BrandingSlotRow
          key={slot.id}
          slot={slot}
          asset={slot.pick(branding)}
          version={versions[slot.id] ?? 0}
          busy={busy !== null}
          working={busy === slot.id}
          error={errors[slot.id]}
          confirming={confirming === slot.id}
          onPick={(file) => void doUpload(slot, file)}
          onAskRemove={() => setConfirming(slot.id)}
          onCancelRemove={() => setConfirming(null)}
          onConfirmRemove={() => void doRemove(slot)}
        />
      ))}
    </div>
  );
}

function BrandingSlotRow({
  slot,
  asset,
  version,
  busy,
  working,
  error,
  confirming,
  onPick,
  onAskRemove,
  onCancelRemove,
  onConfirmRemove,
}: {
  slot: SlotDef;
  asset: BrandingAsset | undefined;
  version: number;
  /** Any slot is mid-flight: all controls pause (one change at a time). */
  busy: boolean;
  /** THIS slot is mid-flight. */
  working: boolean;
  error: string | undefined;
  confirming: boolean;
  onPick: (file: File) => void;
  onAskRemove: () => void;
  onCancelRemove: () => void;
  onConfirmRemove: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const lowerLabel = slot.label.toLowerCase();
  const base = brandingAssetUrl(asset);
  const url = base === null ? null : version > 0 ? `${base}?v=${version}` : base;

  return (
    <div className="flex min-w-0 flex-col gap-2 py-3.5 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <span className="block break-words text-sm font-medium text-fg">{slot.label}</span>
        <span className="block text-xs text-fg-muted">{slot.help}</span>
      </div>
      {url !== null ? (
        // eslint-disable-next-line @next/next/no-img-element -- operator-uploaded image served by the backend, not a static asset
        <img src={url} alt={`Current ${lowerLabel}`} className={`bg-surface ${slot.previewClass}`} />
      ) : (
        <p className="text-xs text-fg-muted">Using the built-in default.</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          aria-label={`${slot.label} image`}
          accept={BRANDING_IMAGE_ACCEPT}
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(f);
            e.target.value = "";
          }}
          className="focus-ring rounded-sm text-sm text-fg-muted file:mr-3 file:rounded-full file:border file:border-border file:bg-surface file:px-3.5 file:py-1.5 file:text-[13px] file:font-semibold file:text-fg hover:file:bg-surface-muted disabled:opacity-60"
        />
        {url !== null && !confirming ? (
          <button
            type="button"
            aria-label={`Remove ${lowerLabel}`}
            disabled={busy}
            onClick={onAskRemove}
            className="focus-ring rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-fg-muted transition-colors hover:text-danger disabled:opacity-60"
          >
            Remove…
          </button>
        ) : null}
        {confirming ? (
          <span className="flex items-center gap-2">
            <span className="text-xs text-fg-muted">Remove this image?</span>
            <button
              type="button"
              aria-label={`Confirm removing ${lowerLabel}`}
              disabled={busy}
              onClick={onConfirmRemove}
              className="focus-ring rounded-full bg-danger-solid px-3 py-1 text-xs font-semibold text-danger-fg transition-colors hover:bg-danger-solid/90 disabled:opacity-60"
            >
              Remove
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onCancelRemove}
              className="focus-ring rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-fg-muted transition-colors hover:text-fg disabled:opacity-60"
            >
              Cancel
            </button>
          </span>
        ) : null}
      </div>
      {working ? <p className="text-xs text-fg-muted">Working…</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
