"use client";

import { useEffect, useState } from "react";

import type { DonateSource } from "@/components/DonateButton";
import { CheckIcon, HeartIcon } from "@/components/icons";
import { Badge, Modal } from "@/components/ui";
import { QrCode } from "@/components/QrCode";
import { api } from "@/lib/api";
import type { DonationAddress } from "@/lib/api";
import { DONATION_NETWORKS, NETWORK_META } from "@/lib/donation-address";

function fetchSource(source: DonateSource, signal: AbortSignal): Promise<DonationAddress[]> {
  const req =
    source.kind === "channel"
      ? api.listChannelDonationAddresses(source.handle, signal)
      : api.listUserDonationAddresses(source.userId, signal);
  return req.then((r) => r.addresses).catch(() => []);
}

// SupportButton is the design's watch/channel "Support" affordance (DR5): an
// accent-filled heart pill that opens a crypto-donation dialog (QR tile + mono
// address + copy + verified/unverified pill) bound to the public donation-address
// reads. Display + copy only — Vidra is non-custodial and processes no payments
// (P13). Renders NOTHING unless the entity exposes at least one public address,
// so the accent action never opens an empty dialog. `name` is the entity being
// supported (dialog heading). `label` lets a caller show "Support {name}".
export function SupportButton({
  sources,
  name,
  label = "Support",
  className,
}: {
  sources: DonateSource[];
  name: string;
  label?: string;
  className?: string;
}) {
  const [addresses, setAddresses] = useState<DonationAddress[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (sources.length === 0) return;
    const controller = new AbortController();
    Promise.all(sources.map((s) => fetchSource(s, controller.signal)))
      .then((lists) => {
        if (controller.signal.aborted) return;
        const byId = new Map<string, DonationAddress>();
        for (const addr of lists.flat()) byId.set(addr.id, addr);
        setAddresses([...byId.values()]);
      })
      .catch(() => {
        /* No support affordance if the public read fails. */
      });
    return () => controller.abort();
    // sources is a fresh array each render; key on its stable contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(sources)]);

  if (addresses.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          "focus-ring flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-accent-fg transition-colors hover:bg-accent/90 " +
          (className ?? "")
        }
      >
        <HeartIcon size={16} />
        <span>{label}</span>
      </button>
      {open ? (
        <SupportDialog addresses={addresses} name={name} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function SupportDialog({
  addresses,
  name,
  onClose,
}: {
  addresses: DonationAddress[];
  name: string;
  onClose: () => void;
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  // Mobile bottom-sheet vs desktop centered dialog (design). The dialog only
  // mounts on a user click; guard matchMedia for non-browser test envs.
  const [sheet] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 639px)").matches,
  );

  async function copy(id: string, text: string) {
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
    } catch {
      setCopiedId(null);
      setCopyFailed(true);
    }
  }

  // Curated network order; verified addresses first within a network.
  const ordered = DONATION_NETWORKS.flatMap((network) =>
    addresses
      .filter((a) => a.network === network)
      .sort((a, b) => Number(b.verified) - Number(a.verified)),
  );

  return (
    <Modal
      title={`Support ${name}`}
      onClose={onClose}
      variant={sheet ? "sheet" : "dialog"}
      className="max-h-[85vh] overflow-y-auto"
    >
      <p className="mb-4 text-[12.5px] leading-relaxed text-fg-muted">
        Send crypto directly to the creator. Vidra never holds or processes funds.
      </p>
      <div className="flex flex-col gap-2.5">
        {ordered.map((addr) => {
          const meta = NETWORK_META[addr.network];
          return (
            <div
              key={addr.id}
              className="flex gap-3.5 rounded-[14px] bg-surface-muted p-4"
            >
              <QrCode
                value={addr.address}
                label={`${meta.label} donation address QR${addr.label ? ` (${addr.label})` : ""}`}
                className="h-[76px] w-[76px]"
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-[13.5px] font-bold text-fg">{meta.label}</span>
                  {addr.verified ? (
                    <Badge variant="success" status aria-label="Verified owner">
                      <CheckIcon size={9} strokeWidth={3} />
                      <span>Verified</span>
                    </Badge>
                  ) : (
                    <Badge variant="strong" status aria-label="Unverified">
                      Unverified
                    </Badge>
                  )}
                  <button
                    type="button"
                    aria-label={`Copy ${meta.label} address${addr.label ? ` (${addr.label})` : ""}`}
                    onClick={() => void copy(addr.id, addr.address)}
                    className="focus-ring ml-auto shrink-0 rounded text-[11.5px] font-semibold text-fg-muted transition-colors hover:text-fg"
                  >
                    {copiedId === addr.id ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="mt-1.5 break-all font-mono text-[11.5px] leading-relaxed text-fg-muted">
                  {addr.address}
                </p>
                <p className="mt-1 text-[11.5px] text-fg-muted">
                  {addr.verified ? (
                    // Repo rule: design's fgs *text* maps to the AA-safe fg-muted;
                    // the success line is the one intentional status colour.
                    <span className="text-success">Ownership proven by signed message</span>
                  ) : (
                    "Scan or copy · on-chain only"
                  )}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {copyFailed ? (
        <p className="mt-3 text-xs text-danger">
          Couldn&apos;t copy automatically — select the address and copy it manually.
        </p>
      ) : null}

      <p className="mt-3.5 text-center text-[11.5px] leading-relaxed text-fg-muted">
        Payments are peer-to-peer and irreversible. Double-check the address before sending.
      </p>
    </Modal>
  );
}
