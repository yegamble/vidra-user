#!/usr/bin/env node
// PWA / branding raster-icon generator (Wave F PWA floor).
//
// Source of truth is public/icon.svg (the built-in fallback mark: a white play
// triangle on the brand's near-black rounded square). This script rasterises it
// into the fixed set of installability + platform icons and COMMITS them to
// public/ (unlike the vendored olm runtime, these are checked in):
//
//   favicon.ico            — multi-size (16/32/48), PNG-compressed ICO entries
//   icon-192.png           — PWA manifest icon (purpose "any")
//   icon-512.png           — PWA manifest icon (purpose "any")
//   icon-maskable-512.png  — PWA maskable icon; the mark sits inside the inner
//                            80% safe zone on a full-bleed opaque background so
//                            Android's circle/squircle masks never clip it
//   apple-touch-icon.png   — 180px, opaque full-bleed (iOS composites its own
//                            rounded corners, so transparency must be flattened)
//
// Run: node scripts/generate-icons.mjs   (or `npm run generate:icons`)
// sharp is a devDependency used ONLY here — app code never imports it, so the
// runtime bundle is unaffected. Regenerate + commit whenever icon.svg changes.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(here, "..", "public");

// The mark's own rounded-square fill (public/icon.svg <rect fill>). Flattening
// transparent areas onto this keeps apple-touch/maskable seamless with the mark.
const BRAND_BG = { r: 0x0a, g: 0x0a, b: 0x0c, alpha: 1 };
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

const svg = readFileSync(join(PUBLIC_DIR, "icon.svg"));

// Rasterise icon.svg at a high density so the resize is a downscale (crisp),
// never an upscale. viewBox is 64, so 512dpi renders it well above every target.
function source() {
  return sharp(svg, { density: 512 });
}

/** A square PNG of the mark, optionally flattened onto an opaque background. */
async function pngSquare(size, { background = TRANSPARENT } = {}) {
  return source()
    .resize(size, size, { fit: "contain", background: TRANSPARENT })
    .flatten(background.alpha === 1 ? { background } : false)
    .png()
    .toBuffer();
}

/**
 * A maskable PNG: the mark scaled into the inner (1 - 2*pad) safe zone, centered
 * on a full-bleed opaque background so any mask shape keeps the mark intact.
 */
async function pngMaskable(size, pad = 0.1) {
  const inner = Math.round(size * (1 - pad * 2));
  const mark = await source()
    .resize(inner, inner, { fit: "contain", background: TRANSPARENT })
    .png()
    .toBuffer();
  const margin = Math.round((size - inner) / 2);
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BRAND_BG,
    },
  })
    .composite([{ input: mark, top: margin, left: margin }])
    .png()
    .toBuffer();
}

// Minimal ICO container. Modern browsers accept PNG-compressed ICO entries, so
// each directory entry points at a whole PNG (no BMP/AND-mask bookkeeping).
function encodeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: 1 = icon
  header.writeUInt16LE(images.length, 4);

  const directory = Buffer.alloc(16 * images.length);
  const datas = [];
  let offset = 6 + directory.length;
  images.forEach((img, i) => {
    const e = directory.subarray(i * 16, i * 16 + 16);
    e.writeUInt8(img.size >= 256 ? 0 : img.size, 0); // width (0 => 256)
    e.writeUInt8(img.size >= 256 ? 0 : img.size, 1); // height (0 => 256)
    e.writeUInt8(0, 2); // palette count
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // color planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(img.data.length, 8); // image size
    e.writeUInt32LE(offset, 12); // image offset
    offset += img.data.length;
    datas.push(img.data);
  });
  return Buffer.concat([header, directory, ...datas]);
}

async function main() {
  const write = (name, buf) => {
    writeFileSync(join(PUBLIC_DIR, name), buf);
    console.log(`generate-icons: wrote public/${name} (${buf.length} bytes)`);
  };

  write("icon-192.png", await pngSquare(192));
  write("icon-512.png", await pngSquare(512));
  write("icon-maskable-512.png", await pngMaskable(512));
  write("apple-touch-icon.png", await pngSquare(180, { background: BRAND_BG }));

  const icoSizes = [16, 32, 48];
  const icoImages = await Promise.all(
    icoSizes.map(async (size) => ({ size, data: await pngSquare(size) })),
  );
  write("favicon.ico", encodeIco(icoImages));
}

main().catch((err) => {
  console.error("generate-icons: failed", err);
  process.exit(1);
});
