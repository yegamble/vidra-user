"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { DonationBadge } from "@/components/DonationBadge";
import { HeartIcon, PlusIcon } from "@/components/icons";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { Channel, DonationAddress, DonationNetwork } from "@/lib/api";
import { DONATION_NETWORKS, NETWORK_META, validateDonationAddress } from "@/lib/donation-address";

const INPUT =
  "focus-ring w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg placeholder:text-fg-muted disabled:opacity-60";
const PRIMARY_BTN =
  "focus-ring self-start rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent/90 disabled:opacity-60";
const SECONDARY_BTN =
  "focus-ring rounded-full border border-border bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-muted disabled:opacity-60";

type Status = "loading" | "error" | "ready";

// DonationSettingsView is the /settings/donations surface: add public crypto
// donation addresses (account-level or scoped to a channel you own), see each
// address's verified/unverified badge, prove ownership where a network supports
// it, and delete. NON-CUSTODIAL and display-only — Vidra never holds funds,
// balances, or keys (P13 prohibition). Session-gated like the other settings.
export function DonationSettingsView() {
  const { status } = useSession();

  if (status === "restoring") {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading your account" />
      </div>
    );
  }
  if (status !== "authed") {
    return (
      <EmptyState
        title="Sign in to manage donation addresses"
        message={
          <>
            <Link href="/login" className="focus-ring rounded-sm font-semibold text-fg underline underline-offset-2">
              Sign in
            </Link>{" "}
            to add the crypto addresses shown on your profile and channels.
          </>
        }
      />
    );
  }

  return <Donations />;
}

function Donations() {
  const [status, setStatus] = useState<Status>("loading");
  const [addresses, setAddresses] = useState<DonationAddress[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api.listMyDonationAddresses(controller.signal),
      api.getMyChannels(controller.signal),
    ])
      .then(([list, chans]) => {
        setAddresses(list.addresses);
        setChannels(chans.channels);
        setStatus("ready");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [reloadKey]);

  if (status === "loading") {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading donation addresses" />
      </div>
    );
  }
  if (status === "error") {
    return (
      <ErrorState
        message="Could not load your donation addresses."
        onRetry={() => {
          setStatus("loading");
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      {addresses.length === 0 ? (
        <EmptyState
          icon={<HeartIcon size={24} />}
          tint="pink"
          title="No donation addresses yet"
          message="Add an address below to display it on your profile or a channel."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {addresses.map((addr) => (
            <li key={addr.id}>
              <AddressRow
                address={addr}
                channels={channels}
                onDeleted={(id) => setAddresses((prev) => prev.filter((a) => a.id !== id))}
                onVerified={(updated) =>
                  setAddresses((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
                }
              />
            </li>
          ))}
        </ul>
      )}

      <AddAddress
        channels={channels}
        onAdded={(created) => setAddresses((prev) => [created, ...prev])}
      />
    </div>
  );
}

// AddAddress is the "+ Add address" affordance: collapsed to a single tonal
// button until opened, then the full add form. Keeping it collapsed by default
// is a quiet call-to-action beneath the list and keeps the surface calm when
// the user is just reviewing addresses. (Redesign: the dashed border is retired
// — tonal fills are the design's dominant quiet-action treatment.)
function AddAddress({
  channels,
  onAdded,
}: {
  channels: Channel[];
  onAdded: (created: DonationAddress) => void;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring flex w-full items-center justify-center gap-1.5 rounded-[10px] bg-surface-muted py-3 text-sm font-semibold text-fg transition-colors hover:bg-surface-strong"
      >
        <PlusIcon size={17} strokeWidth={2.2} />
        Add address
      </button>
    );
  }

  return (
    <AddAddressForm
      channels={channels}
      onAdded={(created) => {
        onAdded(created);
        setOpen(false);
      }}
      onCancel={() => setOpen(false)}
    />
  );
}

function AddAddressForm({
  channels,
  onAdded,
  onCancel,
}: {
  channels: Channel[];
  onAdded: (created: DonationAddress) => void;
  onCancel: () => void;
}) {
  const [network, setNetwork] = useState<DonationNetwork>("bitcoin");
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [channelId, setChannelId] = useState(""); // "" = account-level (profile)
  const [addressError, setAddressError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setFormError(null);
    const clientError = validateDonationAddress(network, address);
    if (clientError) {
      setAddressError(clientError);
      return;
    }
    setAddressError(null);
    setSubmitting(true);
    try {
      const created = await api.addDonationAddress({
        network,
        address: address.trim(),
        ...(label.trim() ? { label: label.trim() } : {}),
        ...(channelId ? { channel_id: channelId } : {}),
      });
      onAdded(created);
      // Reset just the address/label; keep network + scope for adding another.
      setAddress("");
      setLabel("");
    } catch (err) {
      if (err instanceof ApiError && err.fields && err.fields.length > 0) {
        const addrField = err.fields.find((f) => f.field === "address");
        if (addrField) setAddressError(addrField.message);
        else setFormError(err.fields[0].message);
      } else if (err instanceof ApiError && err.status === 409) {
        setFormError("You have already added that address for this profile or channel.");
      } else if (err instanceof ApiError && err.status === 422) {
        setAddressError(err.message);
      } else {
        setFormError(errorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-4 rounded-2xl bg-surface-muted p-4"
      aria-label="Add a donation address"
    >
      <h2 className="text-base font-semibold tracking-tight text-fg">Add an address</h2>

      {formError ? (
        <p
          role="alert"
          className="rounded-xl border border-danger-border bg-danger-surface px-3.5 py-2.5 text-sm text-danger"
        >
          {formError}
        </p>
      ) : null}

      <div className="flex flex-col gap-1">
        <label htmlFor="donation-network" className="text-sm font-medium text-fg">
          Network
        </label>
        <select
          id="donation-network"
          value={network}
          onChange={(e) => {
            setNetwork(e.target.value as DonationNetwork);
            setAddressError(null);
          }}
          className={INPUT}
        >
          {DONATION_NETWORKS.map((n) => (
            <option key={n} value={n}>
              {NETWORK_META[n].label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="donation-address" className="text-sm font-medium text-fg">
          Wallet address
        </label>
        <input
          id="donation-address"
          type="text"
          spellCheck={false}
          autoComplete="off"
          maxLength={128}
          value={address}
          placeholder={NETWORK_META[network].placeholder}
          onChange={(e) => {
            setAddress(e.target.value);
            setAddressError(null);
          }}
          aria-invalid={addressError ? true : undefined}
          aria-describedby={addressError ? "donation-address-error" : undefined}
          className={`${INPUT} font-mono`}
        />
        {addressError ? (
          <p id="donation-address-error" className="text-xs text-danger">
            {addressError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="donation-label" className="text-sm font-medium text-fg">
          Label <span className="font-normal text-fg-muted">(optional)</span>
        </label>
        <input
          id="donation-label"
          type="text"
          maxLength={60}
          value={label}
          placeholder="e.g. Tips"
          onChange={(e) => setLabel(e.target.value)}
          className={INPUT}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="donation-scope" className="text-sm font-medium text-fg">
          Show on
        </label>
        <select
          id="donation-scope"
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
          className={INPUT}
        >
          <option value="">Your profile (account-level)</option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              Channel: {c.display_name || c.handle} (@{c.handle})
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={submitting} className={PRIMARY_BTN}>
          {submitting ? "Adding…" : "Save address"}
        </button>
        <button type="button" onClick={onCancel} disabled={submitting} className={SECONDARY_BTN}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function scopeLabel(address: DonationAddress, channels: Channel[]): string {
  if (!address.channel_id) return "Profile";
  const channel = channels.find((c) => c.id === address.channel_id);
  return channel ? `Channel @${channel.handle}` : "Channel";
}

function AddressRow({
  address,
  channels,
  onDeleted,
  onVerified,
}: {
  address: DonationAddress;
  channels: Channel[];
  onDeleted: (id: string) => void;
  onVerified: (updated: DonationAddress) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = NETWORK_META[address.network];

  async function remove() {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await api.deleteDonationAddress(address.id);
      onDeleted(address.id);
    } catch (err) {
      setError(errorMessage(err, "Could not delete this address."));
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-2xl bg-surface-muted p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[14.5px] font-bold text-fg">{meta.label}</span>
        <DonationBadge verified={address.verified} />
        {address.label ? (
          <span className="text-xs text-fg-muted">· {address.label}</span>
        ) : null}
        <span className="ml-auto shrink-0 text-xs text-fg-muted">
          {scopeLabel(address, channels)}
        </span>
      </div>

      <p className="break-all font-mono text-[12.5px] text-fg-muted" title={address.address}>
        {address.address}
      </p>

      {address.verified ? (
        <p className="text-xs font-medium text-success">Ownership proven by a signed message</p>
      ) : (
        <VerifyArea address={address} onVerified={onVerified} />
      )}

      {error ? <p className="text-xs text-danger">{error}</p> : null}

      <div className="flex">
        <button
          type="button"
          disabled={deleting}
          onClick={() => void remove()}
          aria-label={`Delete ${meta.label} address`}
          className="focus-ring self-start rounded-full border border-danger/45 bg-transparent px-3.5 py-1.5 text-[13px] font-semibold text-danger transition-colors hover:bg-danger/10 disabled:opacity-60"
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  );
}

// VerifyArea drives ownership proof for an unverified address. Networks without a
// practical signing standard (bitcoin/litecoin/monero) show an honest
// "verification not available" note instead of a dead button.
function VerifyArea({
  address,
  onVerified,
}: {
  address: DonationAddress;
  onVerified: (updated: DonationAddress) => void;
}) {
  const meta = NETWORK_META[address.network];

  if (!meta.verificationSupported) {
    return (
      <p className="text-xs leading-relaxed text-fg-muted">
        Signature verification is not available for {meta.label} yet — it will show as unverified.
        That is normal; only some networks support message signing.
      </p>
    );
  }

  return <VerifyFlow address={address} onVerified={onVerified} />;
}

function VerifyFlow({
  address,
  onVerified,
}: {
  address: DonationAddress;
  onVerified: (updated: DonationAddress) => void;
}) {
  const meta = NETWORK_META[address.network];
  const [step, setStep] = useState<"idle" | "signing">("idle");
  const [message, setMessage] = useState("");
  const [signature, setSignature] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function requestChallenge() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.challengeDonationAddress(address.id);
      setMessage(res.message);
      setSignature("");
      setStep("signing");
    } catch (err) {
      if (err instanceof ApiError && err.status === 501) {
        setError("This network does not support ownership verification.");
      } else {
        setError(errorMessage(err, "Could not start verification."));
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitSignature() {
    if (signature.trim() === "") {
      setError("Paste the signature from your wallet.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await api.verifyDonationAddress(address.id, { signature: signature.trim() });
      onVerified(updated);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError("That challenge expired. Request a new one and sign it again.");
        setStep("idle");
      } else if (err instanceof ApiError && err.status === 422) {
        setError("That signature did not verify. Check you signed the exact message.");
      } else if (err instanceof ApiError && err.status === 501) {
        setError("This network does not support ownership verification.");
        setStep("idle");
      } else {
        setError(errorMessage(err, "Could not verify the signature."));
      }
    } finally {
      setBusy(false);
    }
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (step === "idle") {
    return (
      <div className="flex flex-col gap-1">
        {error ? <p className="text-xs text-danger">{error}</p> : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void requestChallenge()}
          className={`self-start ${SECONDARY_BTN}`}
        >
          {busy ? "Preparing…" : "Verify ownership"}
        </button>
      </div>
    );
  }

  const messageId = `donation-challenge-${address.id}`;
  const signatureId = `donation-signature-${address.id}`;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface p-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={messageId} className="text-xs font-medium text-fg">
          1. Sign this exact message with your {meta.label} wallet
        </label>
        <div className="flex items-start gap-2">
          <textarea
            id={messageId}
            readOnly
            rows={3}
            value={message}
            onFocus={(e) => e.currentTarget.select()}
            className="focus-ring min-w-0 flex-1 resize-none rounded-xl border border-border bg-surface px-3 py-2 font-mono text-xs text-fg"
          />
          <button
            type="button"
            onClick={() => void copyMessage()}
            aria-label="Copy the message to sign"
            className={`shrink-0 ${SECONDARY_BTN}`}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        {meta.signingInstructions ? (
          <p className="text-xs text-fg-muted">{meta.signingInstructions}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor={signatureId}
          className="text-xs font-medium text-fg"
        >
          2. Paste the signature
        </label>
        <textarea
          id={signatureId}
          rows={2}
          spellCheck={false}
          value={signature}
          placeholder="0x…"
          onChange={(e) => {
            setSignature(e.target.value);
            setError(null);
          }}
          className="focus-ring resize-y rounded-xl border border-border bg-surface px-3 py-2 font-mono text-xs text-fg placeholder:text-fg-muted"
        />
      </div>

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void submitSignature()}
          className={PRIMARY_BTN}
        >
          {busy ? "Verifying…" : "Verify"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setStep("idle");
            setError(null);
            setSignature("");
          }}
          className={SECONDARY_BTN}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
