// Converts the Yale Bright Star Catalogue (5th rev., CDS V/50 `catalog`) into a compact
// little-endian Float32 file: [glon rad, glat rad, Vmag, B-V] per star.
// Usage: node scripts/build-stars.mjs <path/to/bsc5.dat> public/data/stars.bin
import { readFileSync, writeFileSync } from "node:fs";

const [src, out] = process.argv.slice(2);
if (!src || !out) throw new Error("usage: build-stars.mjs <bsc5.dat> <out.bin>");

const DEG = Math.PI / 180;
const rows = [];
for (const line of readFileSync(src, "latin1").split("\n")) {
  // Byte columns are 1-based in the ReadMe; slice() is 0-based, end-exclusive.
  const glon = parseFloat(line.slice(90, 96));
  const glat = parseFloat(line.slice(96, 102));
  const vmag = parseFloat(line.slice(102, 107));
  const bvRaw = parseFloat(line.slice(109, 114));
  if (!Number.isFinite(glon) || !Number.isFinite(glat) || !Number.isFinite(vmag)) continue; // novae/galaxies removed from BSC have blank fields
  rows.push(glon * DEG, glat * DEG, vmag, Number.isFinite(bvRaw) ? bvRaw : 0.6); // 0.6 ~ solar colour when B-V is missing
}
writeFileSync(out, Buffer.from(new Float32Array(rows).buffer));
console.log(`${rows.length / 4} stars -> ${out}`);
