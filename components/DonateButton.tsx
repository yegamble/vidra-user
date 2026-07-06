"use client";

import { useEffect, useState } from "react";

import { DonationBadge } from "@/components/DonationBadge";
import { Button, Modal } from "@/components/ui";
import { api } from "@/lib/api";
import type { DonationAddress } from "@/lib/api";
import { DONATION_NETWORKS, NETWORK_META } from "@/lib/donation-address";

const FIELD =
  "focus-ring min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 font-mono text-xs text-fg";

/** A public donation-address source: a channel (by handle) or a user (by id). */
export type DonateSource =
  | { kind: "channel"; handle: string }
  | { kind: "user"; userId: string };

// Minified Feather-style "heart" icon for the Donate affordance.
function HeartIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z" />
    </svg>
  );
}

function fetchSource(source: DonateSource, signal: AbortSignal): Promise<DonationAddress[]> {
  const req =
    source.kind === "channel"
      ? api.listChannelDonationAddresses(source.handle, signal)
      : api.listUserDonationAddresses(source.userId, signal);
  return req.then((r) => r.addresses).catch(() => []);
}

// DonateButton renders a "Donate" affordance ONLY when the given sources expose
// at least one public address. Clicking opens an accessible dialog that lists
// the address(es) per network with copy buttons, the verified badge, and an
// honesty line. Display+copy only — Vidra never holds funds or processes
// payments (P13). `name` is the entity being supported (for the dialog heading).
export function DonateButton({
  sources,
  name,
}: {
  sources: DonateSource[];
  name: string;
}) {
  const [addresses, setAddresses] = useState<DonationAddress[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (sources.length === 0) return;
    const controller = new AbortController();
    Promise.all(sources.map((s) => fetchSource(s, controller.signal)))
      .then((lists) => {
        if (controller.signal.aborted) return;
        // Dedup by id (account-level vs channel-scoped reads don't overlap, but
        // be safe) and keep verified addresses first within the combined set.
        const byId = new Map<string, DonationAddress>();
        for (const addr of lists.flat()) byId.set(addr.id, addr);
        setAddresses([...byId.values()]);
      })
      .catch(() => {
        /* No donate affordance if the public read fails. */
      });
    return () => controller.abort();
    // sources is a fresh array each render; key on its stable contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(sources)]);

  if (addresses.length === 0) return null;

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} className="gap-1.5">
        <HeartIcon />
        <span>Donate</span>
      </Button>
      {open ? (
        <DonateDialog addresses={addresses} name={name} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function DonateDialog({
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

  // Group by network, preserving the curated network order and, within a
  // network, verified addresses first.
  const groups = DONATION_NETWORKS.map((network) => ({
    network,
    items: addresses
      .filter((a) => a.network === network)
      .sort((a, b) => Number(b.verified) - Number(a.verified)),
  })).filter((g) => g.items.length > 0);

  return (
    <Modal
      title={`Donate to ${name}`}
      onClose={onClose}
      className="max-h-[85vh] overflow-y-auto"
    >
      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <div key={group.network} className="flex flex-col gap-2">
            <h3 className="text-[15px] font-bold tracking-tight text-fg">
              {NETWORK_META[group.network].label}
            </h3>
            {group.items.map((addr) => (
              <div key={addr.id} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-fg-muted">
                    {addr.label || NETWORK_META[addr.network].ticker}
                  </span>
                  <DonationBadge verified={addr.verified} />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={addr.address}
                    aria-label={`${NETWORK_META[addr.network].label} address${
                      addr.label ? ` (${addr.label})` : ""
                    }`}
                    onFocus={(e) => e.currentTarget.select()}
                    className={FIELD}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-label={`Copy ${NETWORK_META[addr.network].label} address${
                      addr.label ? ` (${addr.label})` : ""
                    }`}
                    onClick={() => void copy(addr.id, addr.address)}
                    className="shrink-0"
                  >
                    {copiedId === addr.id ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ))}

        {copyFailed ? (
          <p className="text-xs text-danger">
            Couldn&apos;t copy automatically — select the address and copy it manually.
          </p>
        ) : null}

        <p className="rounded-xl bg-warning/15 px-3.5 py-2.5 text-xs leading-relaxed text-warning">
          These addresses are provided by {name} and shown as-is — Vidra does not hold funds or
          process payments. Never send crypto you can&apos;t afford to lose, and always
          double-check the address before sending.
        </p>
      </div>
    </Modal>
  );
}
