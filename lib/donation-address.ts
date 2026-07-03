import type { DonationNetwork } from "@/lib/api";

// Pure, dependency-free helpers for the P13 donation-address UI: the curated
// network set, per-network display metadata, a best-effort client-side address
// validator (the backend is authoritative — it returns 422 on a malformed
// address — this only surfaces obvious mistakes before a round trip), and the
// per-network verification story (only ethereum has a practical message-signing
// standard; the others are display-only / unverified-only).

/** The curated networks the backend accepts, in a stable display order. */
export const DONATION_NETWORKS: DonationNetwork[] = [
  "bitcoin",
  "ethereum",
  "litecoin",
  "monero",
];

export interface NetworkMeta {
  /** Human label for the select option / group heading. */
  label: string;
  /** Short ticker shown in badges. */
  ticker: string;
  /** Placeholder / example address for the input. */
  placeholder: string;
  /**
   * Whether ownership can be cryptographically proven for this network. Only
   * ethereum (EIP-191 personal_sign) is supported today; the backend returns
   * 501 for the others, which stay unverified-only.
   */
  verificationSupported: boolean;
  /** Wallet-signing instructions shown during the verify flow (when supported). */
  signingInstructions?: string;
}

export const NETWORK_META: Record<DonationNetwork, NetworkMeta> = {
  bitcoin: {
    label: "Bitcoin (BTC)",
    ticker: "BTC",
    placeholder: "bc1… or 1… / 3…",
    verificationSupported: false,
  },
  ethereum: {
    label: "Ethereum (ETH)",
    ticker: "ETH",
    placeholder: "0x…",
    verificationSupported: true,
    signingInstructions:
      "Open your wallet, choose “Sign message” (personal_sign / EIP-191), sign the " +
      "exact message above, and paste the resulting signature here.",
  },
  litecoin: {
    label: "Litecoin (LTC)",
    ticker: "LTC",
    placeholder: "ltc1… or L… / M…",
    verificationSupported: false,
  },
  monero: {
    label: "Monero (XMR)",
    ticker: "XMR",
    placeholder: "4… or 8…",
    verificationSupported: false,
  },
};

// Per-network address shape checks. Intentionally conservative — they reject
// clearly-wrong input (wrong prefix, wrong length, non-alphanumeric) without
// trying to re-implement checksum verification, which is the backend's job.
const PATTERNS: Record<DonationNetwork, RegExp> = {
  // Legacy P2PKH/P2SH (base58, 25–39 chars after the 1/3 prefix) or bech32 (bc1…).
  bitcoin: /^(bc1[0-9ac-hj-np-z]{8,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,39})$/,
  // 0x + 40 hex chars.
  ethereum: /^0x[0-9a-fA-F]{40}$/,
  // Legacy (L/M/3 prefix, base58) or bech32 (ltc1…).
  litecoin: /^(ltc1[0-9ac-hj-np-z]{8,87}|[LM3][a-km-zA-HJ-NP-Z1-9]{25,39})$/,
  // Standard (95) or integrated (106) address: 4/8 prefix, base58 body.
  monero: /^[48][0-9AB][1-9A-HJ-NP-Za-km-z]{93}([1-9A-HJ-NP-Za-km-z]{11})?$/,
};

/**
 * validateDonationAddress returns a human error string when `address` clearly
 * does not match `network`, or `null` when it looks plausible. An empty address
 * returns a "required" message. The backend still has the final say (422).
 */
export function validateDonationAddress(
  network: DonationNetwork,
  address: string,
): string | null {
  const trimmed = address.trim();
  if (trimmed === "") return "Enter a wallet address.";
  if (trimmed.length > 128) return "That address is too long.";
  if (!PATTERNS[network].test(trimmed)) {
    return `That does not look like a valid ${NETWORK_META[network].label} address.`;
  }
  return null;
}
