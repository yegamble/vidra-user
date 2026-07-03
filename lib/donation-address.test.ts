import { describe, expect, it } from "vitest";

import {
  DONATION_NETWORKS,
  NETWORK_META,
  validateDonationAddress,
} from "./donation-address";

describe("donation-address metadata", () => {
  it("exposes the curated network set in a stable order", () => {
    expect(DONATION_NETWORKS).toEqual(["bitcoin", "ethereum", "litecoin", "monero"]);
  });

  it("only ethereum advertises verification support", () => {
    expect(NETWORK_META.ethereum.verificationSupported).toBe(true);
    expect(NETWORK_META.bitcoin.verificationSupported).toBe(false);
    expect(NETWORK_META.litecoin.verificationSupported).toBe(false);
    expect(NETWORK_META.monero.verificationSupported).toBe(false);
  });

  it("gives ethereum signing instructions and leaves the unsupported ones without", () => {
    expect(NETWORK_META.ethereum.signingInstructions).toBeTruthy();
    expect(NETWORK_META.monero.signingInstructions).toBeUndefined();
  });
});

describe("validateDonationAddress", () => {
  it("requires a non-empty address", () => {
    expect(validateDonationAddress("ethereum", "")).toMatch(/enter a wallet address/i);
    expect(validateDonationAddress("ethereum", "   ")).toMatch(/enter a wallet address/i);
  });

  it("accepts a valid ethereum address and trims surrounding whitespace", () => {
    expect(
      validateDonationAddress("ethereum", "0x52908400098527886E0F7030069857D2E4169EE7"),
    ).toBeNull();
    expect(
      validateDonationAddress("ethereum", "  0x52908400098527886E0F7030069857D2E4169EE7  "),
    ).toBeNull();
  });

  it("rejects a wrong-network address against the selected network", () => {
    // A bitcoin address is not valid ethereum, and vice versa.
    const err = validateDonationAddress("ethereum", "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2");
    expect(err).toMatch(/ethereum/i);
    expect(validateDonationAddress("bitcoin", "0x52908400098527886E0F7030069857D2E4169EE7")).toMatch(
      /bitcoin/i,
    );
  });

  it("rejects an ethereum address with a bad length or non-hex body", () => {
    expect(validateDonationAddress("ethereum", "0x123")).toBeTruthy();
    expect(
      validateDonationAddress("ethereum", "0xZZ908400098527886E0F7030069857D2E4169EE7"),
    ).toBeTruthy();
  });

  it("accepts valid bitcoin (legacy + bech32) addresses", () => {
    expect(validateDonationAddress("bitcoin", "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2")).toBeNull();
    expect(
      validateDonationAddress("bitcoin", "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"),
    ).toBeNull();
  });

  it("accepts a valid litecoin address and rejects a bitcoin one for the litecoin network", () => {
    expect(validateDonationAddress("litecoin", "LMHEFMwRsQ3nHDfb9zZqynLHxjuJ2hgGWt")).toBeNull();
    // A P2PKH bitcoin '1…' address is not a litecoin address.
    expect(validateDonationAddress("litecoin", "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2")).toBeTruthy();
  });

  it("accepts a valid 95-char monero address and rejects a short one", () => {
    const xmr =
      "44AFFq5kSiGBoZ4NMDwYtN18obc8AemS33DBLWs3H7otXft3XjrpDtQGv7SqSsaBYBb98uNbr2VBBEt7f2wfn3RVGQBEP3A";
    expect(validateDonationAddress("monero", xmr)).toBeNull();
    expect(validateDonationAddress("monero", "4abc")).toBeTruthy();
  });

  it("rejects an over-long address", () => {
    expect(validateDonationAddress("ethereum", "0x" + "a".repeat(200))).toMatch(/too long/i);
  });
});
