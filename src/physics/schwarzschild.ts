// Schwarzschild null geodesics in geometric units with the Schwarzschild radius r_s = 2GM/c^2 = 1.
// The shader in src/render/shaders/scene.frag mirrors traceRay(); keep the two in step.
//
// Orbit equation (Binet form, e.g. Chandrasekhar 1983, ch. 3): u'' + u = (3/2) r_s u^2, u = 1/r.
// Written as a Cartesian acceleration x'' = -(3/2) h^2 x / r^5 with h = |x × x'| this gives the
// same orbit shapes for any parametrisation speed (Antonelli, "Starless" notes), which lets the
// shader integrate straight 3D positions with no polar-coordinate bookkeeping.

export type Vec3 = [number, number, number];

export const PHOTON_SPHERE = 1.5; // r = 3M
export const ISCO = 3; // r = 6M, innermost stable circular orbit
export const B_CRIT = (3 * Math.sqrt(3)) / 2; // critical impact parameter 3√3 M

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: Vec3) => Math.sqrt(dot(a, a));
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const normalize = (a: Vec3): Vec3 => scale(a, 1 / len(a));

/** Keplerian angular velocity dφ/dt of a circular orbit, Ω = sqrt(M / r^3) with M = 1/2. */
export function keplerOmega(r: number): number {
  return Math.sqrt(0.5 / (r * r * r));
}

/**
 * Frequency ratio g = ν_obs / ν_emit for light from disk gas on a circular orbit at radius r,
 * received by a static observer at rObs. lambda = L_axis / E is the photon's angular momentum
 * about the disk axis per unit energy. Includes gravitational redshift and Doppler shift:
 * g = sqrt(1 - 3M/r) / ((1 - Ω λ) sqrt(1 - 2M/rObs)).
 */
export function diskRedshift(r: number, lambda: number, rObs: number, doppler = true, gravity = true): number {
  // "gravity" covers gravitational redshift plus the orbital time dilation (u^t); "doppler" is the
  // line-of-sight term 1 / (1 - Ω λ) that brightens the approaching side.
  const grav = gravity ? Math.sqrt(1 - 1.5 / r) / Math.sqrt(1 - 1 / rObs) : 1;
  const dop = doppler ? 1 / (1 - keplerOmega(r) * lambda) : 1;
  return grav * dop;
}

export interface CameraRay {
  /** Initial direction for the Cartesian integrator (radial part squeezed by sqrt(1 - r_s/r)). */
  vel: Vec3;
  /** Impact parameter b = L / E, invariant along the ray. */
  b: number;
  /** Photon angular momentum about +y per unit energy, for the physical (incoming) photon. */
  lambda: number;
}

/**
 * Converts a direction seen by a static observer at `pos` into integrator initial conditions.
 * In the static frame, tan α = sqrt(1 - r_s/r) · r dφ/dr, so the radial component is scaled by
 * sqrt(1 - r_s/r); and b = r sin α / sqrt(1 - r_s/r).
 */
export function cameraRay(pos: Vec3, dir: Vec3): CameraRay {
  const r = len(pos);
  const n = normalize(dir);
  const rhat = scale(pos, 1 / r);
  const nr = dot(n, rhat);
  const tang = add(n, scale(rhat, -nr));
  const k = Math.sqrt(1 - 1 / r);
  const vel = normalize(add(tang, scale(rhat, nr * k)));
  const sinA = len(tang);
  const b = (r * sinA) / k;
  const h = cross(pos, vel);
  const hl = len(h);
  // The traced ray runs backwards in time; the real photon moves along -dir, so its L flips sign.
  const lambda = hl > 1e-12 ? -b * (h[1] / hl) : 0;
  return { vel, b, lambda };
}

export interface TraceOptions {
  maxSteps: number;
  /** Step length as a fraction of the current radius. */
  stepK: number;
  escapeRadius: number;
}

export interface DiskHit {
  r: number;
  pos: Vec3;
}

export interface TraceResult {
  fate: "horizon" | "escape" | "unresolved";
  /** Final direction of travel (asymptotic sky direction if escaped). */
  dir: Vec3;
  /** Equatorial-plane (y = 0) crossings, in order. */
  crossings: DiskHit[];
  steps: number;
}

export const DEFAULT_TRACE: TraceOptions = { maxSteps: 400, stepK: 0.05, escapeRadius: 50 };

/** Leapfrog (kick-drift-kick) integration of x'' = -1.5 h^2 x / r^5 with steps ∝ r. */
export function traceRay(pos: Vec3, vel: Vec3, opts: TraceOptions = DEFAULT_TRACE): TraceResult {
  let x: Vec3 = [...pos];
  let v: Vec3 = normalize(vel);
  const hv = cross(x, v);
  const h2 = dot(hv, hv);
  const accel = (p: Vec3): Vec3 => {
    const r2 = dot(p, p);
    return scale(p, (-1.5 * h2) / (r2 * r2 * Math.sqrt(r2)));
  };
  const crossings: DiskHit[] = [];
  let a = accel(x);
  for (let i = 0; i < opts.maxSteps; i++) {
    const r = len(x);
    if (r < 1) return { fate: "horizon", dir: normalize(v), crossings, steps: i };
    if (r > opts.escapeRadius && dot(x, v) > 0) return { fate: "escape", dir: normalize(v), crossings, steps: i };
    const dt = (opts.stepK * Math.max(r - 0.5, 0.1)) / len(v);
    const vHalf = add(v, scale(a, dt / 2));
    const xn = add(x, scale(vHalf, dt));
    a = accel(xn);
    v = add(vHalf, scale(a, dt / 2));
    if (x[1] * xn[1] < 0) {
      const t = x[1] / (x[1] - xn[1]);
      const p = add(x, scale(add(xn, scale(x, -1)), t));
      crossings.push({ r: len(p), pos: p });
    }
    x = xn;
  }
  return { fate: len(x) > PHOTON_SPHERE ? "unresolved" : "horizon", dir: normalize(v), crossings, steps: opts.maxSteps };
}
