// Minimal dependency-free QR code encoder (byte mode, ECC level M, versions
// 1-10 — up to 213 bytes, far above any otpauth:// provisioning URI). Written
// against ISO/IEC 18004; the structure follows the well-known public-domain
// "QR Code generator" algorithm shape (Project Nayuki) without importing it.
//
// WHY VENDORED: the design rules forbid UI/utility dependencies, and the one
// consumer (TOTP enrollment QR on /settings/security) needs only this narrow
// slice of the spec. Every published QR package ships all 40 versions, kanji
// modes, and renderers we would never use. Correctness is unit-tested in
// lib/qr.test.ts against spec constants (format/version BCH vectors), the
// Reed-Solomon divisibility property, and a real decoder (dev-only oracle).
//
// Coordinates: x = column (left→right), y = row (top→bottom). true = dark.

/** ECC codewords per block, level M, versions 1..10 (index version-1). */
const ECC_PER_BLOCK = [10, 16, 26, 18, 24, 16, 18, 22, 22, 26] as const;
/** Number of error-correction blocks, level M, versions 1..10. */
const NUM_BLOCKS = [1, 1, 1, 2, 2, 4, 4, 4, 5, 5] as const;
/** Alignment-pattern center coordinates, versions 1..10. */
const ALIGN_POS: readonly (readonly number[])[] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

const MIN_VERSION = 1;
const MAX_VERSION = 10;
/** Format-info ECC-level indicator bits for level M. */
const ECC_M_FORMAT_BITS = 0;

/** Data modules available in a version-`v` symbol (before codeword rounding). */
function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

function totalCodewords(version: number): number {
  return Math.floor(rawDataModules(version) / 8);
}

function dataCodewords(version: number): number {
  return totalCodewords(version) - ECC_PER_BLOCK[version - 1] * NUM_BLOCKS[version - 1];
}

/** Byte-mode character capacity of a version at level M (exported for tests). */
export function qrByteCapacity(version: number): number {
  const countBits = version <= 9 ? 8 : 16;
  return Math.floor((dataCodewords(version) * 8 - 4 - countBits) / 8);
}

/** The largest payload encodeQr accepts (bytes of UTF-8). */
export const QR_MAX_BYTES = qrByteCapacity(MAX_VERSION);

// --- GF(256) arithmetic (reducing polynomial x^8+x^4+x^3+x^2+1 = 0x11D) ------

/** Galois-field product of two bytes (exported for tests). */
export function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

/**
 * Coefficients (after the implicit leading 1) of the Reed-Solomon generator
 * polynomial of the given degree: (x-α^0)(x-α^1)...(x-α^{degree-1}).
 */
export function rsGenerator(degree: number): Uint8Array {
  const result = new Uint8Array(degree);
  result[degree - 1] = 1; // (x^0 coefficient of the start polynomial "1")
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

/** Reed-Solomon remainder of `data` divided by the generator `divisor`. */
export function rsRemainder(data: ArrayLike<number>, divisor: Uint8Array): Uint8Array {
  const result = new Uint8Array(divisor.length);
  for (let k = 0; k < data.length; k++) {
    const factor = data[k] ^ result[0];
    result.copyWithin(0, 1);
    result[result.length - 1] = 0;
    for (let i = 0; i < divisor.length; i++) {
      result[i] ^= gfMul(divisor[i], factor);
    }
  }
  return result;
}

// --- Format / version information bit sequences ------------------------------

/**
 * The 15 format-info bits for ECC level M and the given mask (BCH(15,5) with
 * generator 0x537, XOR-masked with 0x5412). Exported for tests: mask 0 at
 * level M must equal the ISO 18004 example constant 0x5412.
 */
export function formatInfoBits(mask: number): number {
  const data = (ECC_M_FORMAT_BITS << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) {
    rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  }
  return ((data << 10) | rem) ^ 0x5412;
}

/**
 * The 18 version-info bits for version >= 7 (BCH(18,6), generator 0x1F25).
 * Exported for tests: version 7 must equal the spec example 0x07C94.
 */
export function versionInfoBits(version: number): number {
  let rem = version;
  for (let i = 0; i < 12; i++) {
    rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  }
  return (version << 12) | rem;
}

// --- Codeword construction ----------------------------------------------------

function appendBits(bits: number[], value: number, length: number): void {
  for (let i = length - 1; i >= 0; i--) {
    bits.push((value >>> i) & 1);
  }
}

/**
 * Byte-mode segment + terminator + padding, split into RS blocks with ECC and
 * interleaved into the final codeword sequence for the symbol.
 */
function buildCodewords(data: Uint8Array, version: number): Uint8Array {
  const bits: number[] = [];
  appendBits(bits, 0b0100, 4); // byte-mode indicator
  appendBits(bits, data.length, version <= 9 ? 8 : 16);
  for (const b of data) appendBits(bits, b, 8);

  const capacityBits = dataCodewords(version) * 8;
  appendBits(bits, 0, Math.min(4, capacityBits - bits.length)); // terminator
  appendBits(bits, 0, (8 - (bits.length % 8)) % 8); // to a byte boundary
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) {
    appendBits(bits, pad, 8);
  }

  const dataCw = new Uint8Array(capacityBits / 8);
  bits.forEach((bit, i) => {
    dataCw[i >> 3] |= bit << (7 - (i & 7));
  });

  // Split into blocks (short blocks first, long blocks carry one extra data
  // codeword), append per-block ECC, then interleave column by column.
  const numBlocks = NUM_BLOCKS[version - 1];
  const blockEcc = ECC_PER_BLOCK[version - 1];
  const rawCw = totalCodewords(version);
  const numShort = numBlocks - (rawCw % numBlocks);
  const shortLen = Math.floor(rawCw / numBlocks); // data+ecc length of a short block
  const gen = rsGenerator(blockEcc);

  const blocks: Uint8Array[] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dataLen = shortLen - blockEcc + (i < numShort ? 0 : 1);
    const dat = dataCw.slice(k, k + dataLen);
    k += dataLen;
    const block = new Uint8Array(shortLen + 1); // padded to the long length
    block.set(dat); // short blocks leave a gap at index shortLen - blockEcc
    block.set(rsRemainder(dat, gen), shortLen + 1 - blockEcc);
    blocks.push(block);
  }

  const result = new Uint8Array(rawCw);
  let idx = 0;
  for (let i = 0; i < shortLen + 1; i++) {
    for (let j = 0; j < numBlocks; j++) {
      if (i !== shortLen - blockEcc || j >= numShort) {
        result[idx++] = blocks[j][i];
      }
    }
  }
  return result;
}

// --- Matrix construction --------------------------------------------------------

interface Grid {
  size: number;
  modules: boolean[][]; // [y][x]
  isFunction: boolean[][];
}

function setFunction(g: Grid, x: number, y: number, dark: boolean): void {
  g.modules[y][x] = dark;
  g.isFunction[y][x] = true;
}

function drawFinder(g: Grid, cx: number, cy: number): void {
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || x >= g.size || y < 0 || y >= g.size) continue;
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      setFunction(g, x, y, dist !== 2 && dist !== 4);
    }
  }
}

function drawAlignment(g: Grid, cx: number, cy: number): void {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      setFunction(g, cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
}

function drawFormatBits(g: Grid, mask: number): void {
  const bits = formatInfoBits(mask);
  const bit = (i: number) => ((bits >>> i) & 1) !== 0;
  // Copy around the top-left finder.
  for (let i = 0; i <= 5; i++) setFunction(g, 8, i, bit(i));
  setFunction(g, 8, 7, bit(6));
  setFunction(g, 8, 8, bit(7));
  setFunction(g, 7, 8, bit(8));
  for (let i = 9; i < 15; i++) setFunction(g, 14 - i, 8, bit(i));
  // Copy split across the other two finders.
  for (let i = 0; i < 8; i++) setFunction(g, g.size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) setFunction(g, 8, g.size - 15 + i, bit(i));
  setFunction(g, 8, g.size - 8, true); // the always-dark module
}

function drawVersionInfo(g: Grid, version: number): void {
  if (version < 7) return;
  const bits = versionInfoBits(version);
  for (let i = 0; i < 18; i++) {
    const dark = ((bits >>> i) & 1) !== 0;
    const a = g.size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    setFunction(g, a, b, dark);
    setFunction(g, b, a, dark);
  }
}

function drawFunctionPatterns(g: Grid, version: number): void {
  for (let i = 0; i < g.size; i++) {
    setFunction(g, 6, i, i % 2 === 0); // vertical timing
    setFunction(g, i, 6, i % 2 === 0); // horizontal timing
  }
  drawFinder(g, 3, 3);
  drawFinder(g, g.size - 4, 3);
  drawFinder(g, 3, g.size - 4);

  const pos = ALIGN_POS[version - 1];
  const last = pos.length - 1;
  for (let i = 0; i < pos.length; i++) {
    for (let j = 0; j < pos.length; j++) {
      // Skip the three centers that would overlap the finder patterns.
      const overlapsFinder =
        (i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0);
      if (!overlapsFinder) drawAlignment(g, pos[i], pos[j]);
    }
  }

  drawFormatBits(g, 0); // reserve the format areas (real mask drawn later)
  drawVersionInfo(g, version);
}

function drawCodewords(g: Grid, data: Uint8Array): void {
  let i = 0; // bit index into data
  for (let right = g.size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // skip the vertical timing column
    for (let vert = 0; vert < g.size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? g.size - 1 - vert : vert;
        if (!g.isFunction[y][x] && i < data.length * 8) {
          g.modules[y][x] = ((data[i >> 3] >>> (7 - (i & 7))) & 1) !== 0;
          i++;
        }
        // Remainder positions stay light (spec: remainder bits are zero).
      }
    }
  }
}

function maskBit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

/** XOR the mask over every non-function module (self-inverse). */
function applyMask(g: Grid, mask: number): void {
  for (let y = 0; y < g.size; y++) {
    for (let x = 0; x < g.size; x++) {
      if (!g.isFunction[y][x] && maskBit(mask, x, y)) {
        g.modules[y][x] = !g.modules[y][x];
      }
    }
  }
}

// Penalty weights from the spec. A bug here can only pick a sub-optimal (still
// perfectly decodable) mask, never an invalid symbol.
const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

const FINDERISH_A = [false, false, false, false, true, false, true, true, true, false, true];
const FINDERISH_B = [true, false, true, true, true, false, true, false, false, false, false];

function lineRunPenalty(line: boolean[]): number {
  let penalty = 0;
  // N1: runs of same-colored modules of length >= 5.
  let runColor = line[0];
  let runLen = 1;
  for (let i = 1; i <= line.length; i++) {
    if (i < line.length && line[i] === runColor) {
      runLen++;
      continue;
    }
    if (runLen >= 5) penalty += PENALTY_N1 + (runLen - 5);
    if (i < line.length) {
      runColor = line[i];
      runLen = 1;
    }
  }
  // N3: finder-like 1:1:3:1:1 patterns with a 4-module light flank.
  for (let i = 0; i + 11 <= line.length; i++) {
    let matchA = true;
    let matchB = true;
    for (let j = 0; j < 11; j++) {
      if (line[i + j] !== FINDERISH_A[j]) matchA = false;
      if (line[i + j] !== FINDERISH_B[j]) matchB = false;
    }
    if (matchA) penalty += PENALTY_N3;
    if (matchB) penalty += PENALTY_N3;
  }
  return penalty;
}

function penaltyScore(g: Grid): number {
  let penalty = 0;
  let dark = 0;
  for (let y = 0; y < g.size; y++) {
    penalty += lineRunPenalty(g.modules[y]);
    for (let x = 0; x < g.size; x++) {
      if (g.modules[y][x]) dark++;
    }
  }
  for (let x = 0; x < g.size; x++) {
    penalty += lineRunPenalty(g.modules.map((row) => row[x]));
  }
  // N2: 2x2 blocks of a single color.
  for (let y = 0; y + 1 < g.size; y++) {
    for (let x = 0; x + 1 < g.size; x++) {
      const c = g.modules[y][x];
      if (c === g.modules[y][x + 1] && c === g.modules[y + 1][x] && c === g.modules[y + 1][x + 1]) {
        penalty += PENALTY_N2;
      }
    }
  }
  // N4: deviation of the dark-module proportion from 50%, per 5% step.
  const total = g.size * g.size;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  penalty += Math.max(0, k) * PENALTY_N4;
  return penalty;
}

/**
 * Encode `text` (UTF-8, byte mode, ECC level M) into a QR module matrix —
 * `matrix[y][x]` is true for a dark module. Throws when the payload exceeds
 * QR_MAX_BYTES (version 10-M). The caller adds the 4-module quiet zone.
 */
export function encodeQr(text: string): boolean[][] {
  const data = new TextEncoder().encode(text);
  let version = MIN_VERSION;
  while (qrByteCapacity(version) < data.length) {
    version++;
    if (version > MAX_VERSION) {
      throw new Error(`qr: payload of ${data.length} bytes exceeds ${QR_MAX_BYTES}`);
    }
  }

  const size = version * 4 + 17;
  const g: Grid = {
    size,
    modules: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
    isFunction: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
  };
  drawFunctionPatterns(g, version);
  drawCodewords(g, buildCodewords(data, version));

  // Pick the mask with the lowest penalty (format bits redrawn per candidate).
  let bestMask = 0;
  let bestPenalty = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(g, mask);
    drawFormatBits(g, mask);
    const penalty = penaltyScore(g);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = mask;
    }
    applyMask(g, mask); // undo (XOR is self-inverse)
  }
  applyMask(g, bestMask);
  drawFormatBits(g, bestMask);
  return g.modules;
}

/**
 * One SVG path drawing every dark module as a 1x1 unit square at its (x, y)
 * position — for `<path d={...}/>` inside a viewBox spanning the matrix plus
 * quiet zone.
 */
export function qrSvgPath(modules: boolean[][]): string {
  const parts: string[] = [];
  for (let y = 0; y < modules.length; y++) {
    for (let x = 0; x < modules[y].length; x++) {
      if (modules[y][x]) parts.push(`M${x} ${y}h1v1h-1z`);
    }
  }
  return parts.join("");
}
