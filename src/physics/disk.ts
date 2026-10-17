// Novikov-Thorne thin-disk emission for a Schwarzschild hole (r_s = 1, M = 1/2).
// Flux from Page & Thorne (1974), ApJ 191, 499, eq. (15n):
//   F(r) = -(Ṁ / 4π r) · Ω_,r / (E - ΩL)^2 · ∫_{r_isco}^{r} (E - ΩL) L_,r dr
// with circular-orbit energy E, angular momentum L and angular velocity Ω.
// Local effective temperature follows from σT^4 = F, so T / T_max = (F / F_max)^(1/4).
import { ISCO } from "./schwarzschild";

const M = 0.5;
const E = (r: number) => (1 - (2 * M) / r) / Math.sqrt(1 - (3 * M) / r);
const L = (r: number) => Math.sqrt(M * r) / Math.sqrt(1 - (3 * M) / r);
const Om = (r: number) => Math.sqrt(M / (r * r * r));
const d = (f: (r: number) => number, r: number) => {
  const h = 1e-5 * r;
  return (f(r + h) - f(r - h)) / (2 * h);
};

/** Unnormalised Novikov-Thorne flux at each radius in `radii` (ascending, all >= ISCO). */
export function novikovThorneFlux(radii: number[]): number[] {
  const out: number[] = [];
  let integral = 0;
  let prevR = ISCO;
  let prevF = 0; // integrand (E - ΩL) L_,r at the previous radius
  for (const r of radii) {
    // Trapezoid on a fine sub-grid between consecutive radii.
    const n = Math.max(1, Math.ceil((r - prevR) / 0.01));
    const h = (r - prevR) / n;
    for (let i = 1; i <= n; i++) {
      const ri = prevR + i * h;
      const fi = (E(ri) - Om(ri) * L(ri)) * d(L, ri);
      integral += ((prevF + fi) / 2) * h;
      prevF = fi;
    }
    prevR = r;
    const em = E(r) - Om(r) * L(r);
    out.push(r <= ISCO ? 0 : (-d(Om, r) / (r * em * em)) * integral);
  }
  return out;
}

export interface TempTable {
  rMin: number;
  rMax: number;
  /** T / T_max sampled uniformly in r from rMin to rMax. */
  values: Float32Array;
}

/** Temperature profile T(r)/T_max on a uniform grid, for upload as a 1D lookup texture. */
export function temperatureTable(rMax = 30, size = 512): TempTable {
  const radii = Array.from({ length: size }, (_, i) => ISCO + ((rMax - ISCO) * i) / (size - 1));
  const flux = novikovThorneFlux(radii);
  const fMax = Math.max(...flux);
  return { rMin: ISCO, rMax, values: Float32Array.from(flux, (f) => Math.pow(Math.max(f, 0) / fMax, 0.25)) };
}
