// Blackbody colours. CIE 1931 2° colour matching functions from the multi-lobe Gaussian fit of
// Wyman, Sloan & Shirley (2013), "Simple Analytic Approximations to the CIE XYZ Color Matching
// Functions", JCGT 2(2). XYZ -> linear sRGB (D65) matrix from IEC 61966-2-1.

const g = (x: number, mu: number, s1: number, s2: number) => {
  const t = (x - mu) / (x < mu ? s1 : s2);
  return Math.exp(-0.5 * t * t);
};

/** CIE 1931 x̄ȳz̄ at wavelength nm. */
export function cmf(nm: number): [number, number, number] {
  return [
    1.056 * g(nm, 599.8, 37.9, 31.0) + 0.362 * g(nm, 442.0, 16.0, 26.7) - 0.065 * g(nm, 501.1, 20.4, 26.2),
    0.821 * g(nm, 568.8, 46.9, 40.5) + 0.286 * g(nm, 530.9, 16.3, 31.1),
    1.217 * g(nm, 437.0, 11.8, 36.0) + 0.681 * g(nm, 459.0, 26.0, 13.8),
  ];
}

const H = 6.62607015e-34;
const C = 2.99792458e8;
const K = 1.380649e-23;

/** Planck spectral radiance B_λ(T) in W·sr⁻¹·m⁻³. */
export function planck(nm: number, T: number): number {
  const l = nm * 1e-9;
  return (2 * H * C * C) / (l ** 5 * Math.expm1((H * C) / (l * K * T)));
}

export function blackbodyXYZ(T: number): [number, number, number] {
  let X = 0, Y = 0, Z = 0;
  for (let nm = 380; nm <= 780; nm += 2) {
    const b = planck(nm, T);
    const [x, y, z] = cmf(nm);
    X += x * b; Y += y * b; Z += z * b;
  }
  return [X, Y, Z];
}

export function xyzToLinearSrgb([X, Y, Z]: [number, number, number]): [number, number, number] {
  return [
    3.2406 * X - 1.5372 * Y - 0.4986 * Z,
    -0.9689 * X + 1.8758 * Y + 0.0415 * Z,
    0.0557 * X - 0.204 * Y + 1.057 * Z,
  ];
}

/** Effective temperature from B-V colour index, Ballesteros (2012), EPL 97, 34008. */
export function bvToKelvin(bv: number): number {
  return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
}

export interface BlackbodyTable {
  tMin: number;
  tMax: number;
  /** RGBA per entry, log-spaced in T: rgb = linear sRGB scaled to unit luminance, a = ln(Y / Y(tRef)). */
  data: Float32Array;
  size: number;
}

export const T_REF = 6500;

/** Lookup table of blackbody colour and log luminance, for a 2D (size × 1) float texture. */
export function blackbodyTable(tMin = 800, tMax = 100000, size = 256): BlackbodyTable {
  const yRef = blackbodyXYZ(T_REF)[1];
  const data = new Float32Array(size * 4);
  for (let i = 0; i < size; i++) {
    const T = tMin * Math.pow(tMax / tMin, i / (size - 1));
    const xyz = blackbodyXYZ(T);
    const rgb = xyzToLinearSrgb(xyz).map((c) => Math.max(c, 0));
    const lum = Math.max(0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2], 1e-30);
    data.set([rgb[0] / lum, rgb[1] / lum, rgb[2] / lum, Math.log(Math.max(xyz[1] / yRef, 1e-30))], i * 4);
  }
  return { tMin, tMax, data, size };
}
