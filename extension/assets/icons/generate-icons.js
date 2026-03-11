/**
 * Generates simple PNG icon files for the Chrome extension.
 * Run: node generate-icons.js
 * No external dependencies — uses only Node.js built-ins.
 */

'use strict';

const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// Icon sizes required by manifest
const SIZES = [16, 48, 128];

// Brand blue: #3b82f6
const BG_R = 0x3b, BG_G = 0x82, BG_B = 0xf6;
// Box icon color: white
const FG_R = 0xff, FG_G = 0xff, FG_B = 0xff;

// ── CRC32 ─────────────────────────────────────────────────────────────────────
function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
}
const CRC_TABLE = makeCrcTable();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ── PNG chunk ─────────────────────────────────────────────────────────────────
function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf  = Buffer.allocUnsafe(4);
  const crcBuf  = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32BE(data.length);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

// ── Draw pixel grid ───────────────────────────────────────────────────────────
function drawIcon(size) {
  // 3-channel RGB pixel grid, row-major
  const pixels = [];
  for (let y = 0; y < size; y++) {
    const row = [];
    for (let x = 0; x < size; x++) {
      row.push(bgPixel()); // start with background
    }
    pixels.push(row);
  }

  // Draw a simple box outline (package icon)
  const m  = Math.round(size * 0.15); // margin
  const bw = 1 + Math.max(1, Math.round(size / 32)); // border width

  // Box body
  for (let y = m; y < size - m; y++) {
    for (let x = m; x < size - m; x++) {
      const onEdge = x < m + bw || x >= size - m - bw || y < m + bw || y >= size - m - bw;
      if (onEdge) {
        pixels[y][x] = [FG_R, FG_G, FG_B];
      } else {
        // Light fill inside box
        pixels[y][x] = [0x5b, 0xa3, 0xff]; // lighter blue
      }
    }
  }

  // Lid line across top quarter
  if (size >= 16) {
    const lidY = m + Math.round((size - 2 * m) * 0.35);
    for (let x = m; x < size - m; x++) {
      pixels[lidY][x] = [FG_R, FG_G, FG_B];
    }

    // Center bow-tie on lid
    if (size >= 32) {
      const midX    = Math.floor(size / 2);
      const bowW    = Math.max(2, Math.round(size * 0.08));
      for (let y = m; y <= lidY; y++) {
        for (let dx = -bowW; dx <= bowW; dx++) {
          const px = midX + dx;
          if (px >= m && px < size - m) pixels[y][px] = [FG_R, FG_G, FG_B];
        }
      }
    }
  }

  return pixels;
}

// ── Build PNG binary ──────────────────────────────────────────────────────────
function buildPng(size) {
  const pixels = drawIcon(size);

  // Raw scanlines: filter byte (0) + RGB per pixel
  const raw = Buffer.allocUnsafe(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    const rowOffset = y * (1 + size * 3);
    raw[rowOffset] = 0; // filter type: None
    for (let x = 0; x < size; x++) {
      const [r, g, b]  = pixels[y][x];
      const pixOffset  = rowOffset + 1 + x * 3;
      raw[pixOffset]   = r;
      raw[pixOffset+1] = g;
      raw[pixOffset+2] = b;
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 6 });

  // IHDR
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8]  = 8;  // bit depth
  ihdr[9]  = 2;  // color type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function bgPixel() {
  return [BG_R, BG_G, BG_B];
}

// ── Main ──────────────────────────────────────────────────────────────────────
const outDir = __dirname;

SIZES.forEach(size => {
  const png  = buildPng(size);
  const file = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(file, png);
  console.log(`Created: icon${size}.png (${png.length} bytes)`);
});

console.log('\nDone! Icons generated in:', outDir);
