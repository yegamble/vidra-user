import jsQR from "jsqr";
import { describe, expect, it } from "vitest";

import {
  QR_MAX_BYTES,
  encodeQr,
  formatInfoBits,
  gfMul,
  qrByteCapacity,
  qrSvgPath,
  rsGenerator,
  rsRemainder,
  versionInfoBits,
} from "./qr";

// Rasterize a module matrix to RGBA pixels (scale + quiet zone) so the real
// decoder (jsqr, a dev-only test oracle — never shipped) can read it back.
function rasterize(modules: boolean[][], scale = 4, quiet = 4) {
  const size = (modules.length + quiet * 2) * scale;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let y = 0; y < modules.length; y++) {
    for (let x = 0; x < modules.length; x++) {
      if (!modules[y][x]) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = (x + quiet) * scale + dx;
          const py = (y + quiet) * scale + dy;
          const i = (py * size + px) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
      }
    }
  }
  return { data, size };
}

function decode(modules: boolean[][]): string | null {
  const { data, size } = rasterize(modules);
  return jsQR(data, size, size)?.data ?? null;
}

describe("qr spec constants", () => {
  it("format info for ECC M, mask 0 equals the ISO 18004 example 0x5412", () => {
    // Data bits (00 000) are all zero, so the result is exactly the XOR mask —
    // this pins both the BCH(15,5) remainder and the mask constant.
    expect(formatInfoBits(0)).toBe(0x5412);
  });

  it("every format info value is 15 bits and distinct per mask", () => {
    const seen = new Set<number>();
    for (let mask = 0; mask < 8; mask++) {
      const bits = formatInfoBits(mask);
      expect(bits).toBeLessThan(1 << 15);
      seen.add(bits);
    }
    expect(seen.size).toBe(8);
  });

  it("version info bits for version 7 equal the spec example 0x07C94", () => {
    expect(versionInfoBits(7)).toBe(0x07c94);
  });

  it("GF(256) sanity: 2^8 reduces to 0x1D under 0x11D", () => {
    // α^8 = α^4+α^3+α^2+1: pins the reducing polynomial.
    let p = 1;
    for (let i = 0; i < 8; i++) p = gfMul(p, 2);
    expect(p).toBe(0x1d);
    expect(gfMul(0, 0x53)).toBe(0);
    expect(gfMul(1, 0x53)).toBe(0x53);
  });

  it("byte-mode capacities at level M match the published table", () => {
    // Spot-pinned from the ISO capacity table (level M, byte mode).
    expect(qrByteCapacity(1)).toBe(14);
    expect(qrByteCapacity(5)).toBe(84);
    expect(qrByteCapacity(10)).toBe(213);
    expect(QR_MAX_BYTES).toBe(213);
  });
});

describe("reed-solomon", () => {
  it("appending the remainder makes the codeword divisible by the generator", () => {
    const gen = rsGenerator(10);
    const data = Array.from({ length: 16 }, (_, i) => (i * 37 + 5) & 0xff);
    const ecc = rsRemainder(data, gen);
    expect(ecc).toHaveLength(10);
    // Dividing the full codeword (data ++ ecc) again must leave remainder 0.
    const again = rsRemainder([...data, ...ecc], gen);
    expect(Array.from(again)).toEqual(new Array(10).fill(0));
  });
});

describe("encodeQr", () => {
  const OTPAUTH =
    "otpauth://totp/Vidra:ada@example.test?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Vidra&algorithm=SHA1&digits=6&period=30";

  it("produces a square matrix with the three finder patterns", () => {
    const m = encodeQr("hello");
    const size = m.length;
    expect((size - 17) % 4).toBe(0);
    for (const row of m) expect(row).toHaveLength(size);
    // Finder centers are dark; the 1-module separator ring around each is light.
    for (const [cx, cy] of [
      [3, 3],
      [size - 4, 3],
      [3, size - 4],
    ]) {
      expect(m[cy][cx]).toBe(true);
      expect(m[cy][cx + (cx === 3 ? 4 : -4)]).toBe(false);
    }
    // Timing patterns alternate starting dark at (6,6)... between the finders.
    for (let i = 8; i < size - 8; i++) {
      expect(m[6][i]).toBe(i % 2 === 0);
      expect(m[i][6]).toBe(i % 2 === 0);
    }
    // The always-dark module next to the bottom-left finder.
    expect(m[size - 8][8]).toBe(true);
  });

  it("round-trips a short payload through a real decoder", () => {
    expect(decode(encodeQr("hello world"))).toBe("hello world");
  });

  it("round-trips a realistic otpauth:// provisioning URI (multi-block version)", () => {
    const m = encodeQr(OTPAUTH);
    expect(m.length).toBeGreaterThanOrEqual(41); // needs version >= 6 (multi-block ECC)
    expect(decode(m)).toBe(OTPAUTH);
  });

  it("round-trips a version >= 7 payload (version info drawn)", () => {
    const long = `${OTPAUTH}&image=${"x".repeat(140 - OTPAUTH.length + 40)}`;
    const m = encodeQr(long);
    expect(m.length).toBeGreaterThanOrEqual(45); // version 7+
    expect(decode(m)).toBe(long);
  });

  it("rejects payloads beyond the version-10 capacity", () => {
    expect(() => encodeQr("x".repeat(QR_MAX_BYTES))).not.toThrow();
    expect(() => encodeQr("x".repeat(QR_MAX_BYTES + 1))).toThrow(/exceeds/);
  });

  it("qrSvgPath draws one unit square per dark module", () => {
    const m = [
      [true, false],
      [false, true],
    ];
    expect(qrSvgPath(m)).toBe("M0 0h1v1h-1zM1 1h1v1h-1z");
  });
});
