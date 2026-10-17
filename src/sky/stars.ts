// Background sky from the Yale Bright Star Catalogue (Hoffleit & Warren 1991, CDS V/50), baked into
// a float cubemap. Positions are galactic (l, b) so the Milky Way's plane can be placed deliberately.
import { bvToKelvin, blackbodyXYZ, xyzToLinearSrgb } from "../physics/color";
import type { Vec3 } from "../physics/schwarzschild";

export interface Star {
  l: number;
  b: number;
  vmag: number;
  bv: number;
}

export function parseStars(buf: ArrayBuffer): Star[] {
  const f = new Float32Array(buf);
  const out: Star[] = [];
  for (let i = 0; i + 3 < f.length; i += 4) out.push({ l: f[i], b: f[i + 1], vmag: f[i + 2], bv: f[i + 3] });
  return out;
}

const SKY_TILT = (25 * Math.PI) / 180; // galactic plane vs. disk plane, about the view axis

/**
 * Galactic direction -> world. The galactic centre (l = 0) sits at world -z, straight behind the
 * hole from the default camera on +z; galactic north is world +y, then the frame is rolled by SKY_TILT.
 */
export function galacticToWorld(l: number, b: number): Vec3 {
  const gx = Math.cos(b) * Math.cos(l);
  const gy = Math.cos(b) * Math.sin(l);
  const gz = Math.sin(b);
  const x = gy, y = gz, z = -gx;
  const c = Math.cos(SKY_TILT), s = Math.sin(SKY_TILT);
  return [c * x - s * y, s * x + c * y, z];
}

/**
 * Column-major mat3 taking a world direction to galactic Cartesian (x toward l = 0, z toward the
 * north galactic pole). The transpose of the orthonormal galacticToWorld basis.
 */
export function worldToGalacticMatrix(): Float32Array {
  const ex = galacticToWorld(0, 0), ey = galacticToWorld(Math.PI / 2, 0), ez = galacticToWorld(0, Math.PI / 2);
  return new Float32Array([ex[0], ey[0], ez[0], ex[1], ey[1], ez[1], ex[2], ey[2], ez[2]]);
}

/**
 * Equirectangular texture coords of a galactic direction in the NASA SVS galactic maps: l = 0 at
 * the centre, l increasing to the left, north galactic pole at the top (v = 0). scene.frag mirrors it.
 */
export function galacticToUv(l: number, b: number): [number, number] {
  const u = 0.5 - l / (2 * Math.PI);
  return [u - Math.floor(u), 0.5 - b / Math.PI];
}

/**
 * Milky Way surface brightness assumed for texture value 1 (its 99.95th percentile, the inner-bulge
 * star clouds): 20.5 V mag/arcsec². Surface photometry puts the bright Milky Way clouds at about
 * 20.7-20.8 V mag/arcsec² (Bochum and Pannekoek data compared by van der Kruit 2024, arXiv:2401.15518,
 * Table 3); the bulge core is a little brighter. Converted to the star units used by the cubemap
 * (V = 0 star = 1, per face-centre texel of a 512² face, which subtends (2/512)² sr = 6.5e5 arcsec²).
 */
export const MILKY_WAY_SCALE = Math.pow(10, -0.4 * 20.5) * (2 / 512) ** 2 * (180 / Math.PI * 3600) ** 2;

/**
 * Cube texel solid angle relative to the face centre, (1 + u² + v²)^(-3/2) for u, v in [-1, 1]:
 * the area scale 1/cos³c of the gnomonic projection (Snyder 1987, USGS Prof. Paper 1395, §22).
 */
export function texelSolidAngle(s: number, t: number): number {
  const u = 2 * s - 1, v = 2 * t - 1;
  return Math.pow(1 + u * u + v * v, -1.5);
}

/** GL cubemap face order: +X, -X, +Y, -Y, +Z, -Z. Returns face and texel coords s,t in [0, 1]. */
export function dirToFace([x, y, z]: Vec3): { face: number; s: number; t: number } {
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  let face: number, sc: number, tc: number, ma: number;
  if (ax >= ay && ax >= az) { face = x > 0 ? 0 : 1; sc = x > 0 ? -z : z; tc = -y; ma = ax; }
  else if (ay >= az) { face = y > 0 ? 2 : 3; sc = x; tc = y > 0 ? z : -z; ma = ay; }
  else { face = z > 0 ? 4 : 5; sc = z > 0 ? x : -x; tc = -y; ma = az; }
  return { face, s: (sc / ma + 1) / 2, t: (tc / ma + 1) / 2 };
}

export function faceToDir(face: number, s: number, t: number): Vec3 {
  const sc = 2 * s - 1, tc = 2 * t - 1;
  switch (face) {
    case 0: return [1, -tc, -sc];
    case 1: return [-1, -tc, sc];
    case 2: return [sc, 1, tc];
    case 3: return [sc, -1, -tc];
    case 4: return [sc, -tc, 1];
    default: return [-sc, -tc, -1];
  }
}

/** Linear sRGB colour of a star, scaled so a V = 0 star has unit luminance. */
export function starColor(star: Star): Vec3 {
  const [r, g, b] = xyzToLinearSrgb(blackbodyXYZ(bvToKelvin(star.bv))).map((c) => Math.max(c, 0));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const flux = Math.pow(10, -0.4 * star.vmag);
  return [(r / lum) * flux, (g / lum) * flux, (b / lum) * flux];
}

/** Stars grouped by cubemap face with texel coords and colour; size-independent, so computed once. */
export type PlacedStars = { s: number; t: number; c: Vec3 }[][];

export function placeStars(stars: Star[]): PlacedStars {
  const byFace: PlacedStars = Array.from({ length: 6 }, () => []);
  for (const star of stars) {
    const { face, s, t } = dirToFace(galacticToWorld(star.l, star.b));
    byFace[face].push({ s, t, c: starColor(star) });
  }
  return byFace;
}

/**
 * Splats every star into six RGBA float faces of `size`² texels with a small Gaussian, calling
 * `emit` once per face with a reused buffer (one face in memory at a time). Values are scaled by
 * (size / 512)² so the 512-texel mip level has the same brightness at every size, and divided by
 * the texel's relative solid angle so a star looks equally bright anywhere on a face (a filtered
 * lookup averages over texels, and texels near face corners cover up to 5x less sky).
 */
export function bakeStarFaces(byFace: PlacedStars, size: number, emit: (face: number, data: Float32Array) => void): void {
  const buf = new Float32Array(size * size * 4);
  const gain = (size / 512) ** 2;
  const sigma = 0.6;
  const w = new Float32Array(9);
  byFace.forEach((list, face) => {
    buf.fill(0);
    for (const { s, t, c } of list) {
      const g = gain / texelSolidAngle(s, t);
      const px = s * size - 0.5, py = t * size - 0.5;
      const x0 = Math.round(px), y0 = Math.round(py);
      let wsum = 0;
      for (let k = 0; k < 9; k++) {
        const dx = (k % 3) - 1, dy = Math.floor(k / 3) - 1;
        w[k] = Math.exp(-((x0 + dx - px) ** 2 + (y0 + dy - py) ** 2) / (2 * sigma * sigma));
        wsum += w[k];
      }
      for (let k = 0; k < 9; k++) {
        const xi = x0 + (k % 3) - 1, yi = y0 + Math.floor(k / 3) - 1;
        if (xi < 0 || yi < 0 || xi >= size || yi >= size) continue;
        const ww = (w[k] / wsum) * g, o = (yi * size + xi) * 4;
        buf[o] += c[0] * ww; buf[o + 1] += c[1] * ww; buf[o + 2] += c[2] * ww; buf[o + 3] = 1;
      }
    }
    emit(face, buf);
  });
}
