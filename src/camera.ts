// Orbit camera around the hole: spherical (radius, azimuth, elevation) with damped velocity.
import type { Vec3 } from "./physics/schwarzschild";

export const R_MIN = 2.2; // stays outside the photon sphere (1.5) with a margin
export const R_MAX = 60;
const EL_MAX = Math.PI / 2 - 0.02;

export interface CameraState {
  radius: number;
  azimuth: number;
  elevation: number;
}

export class OrbitCamera implements CameraState {
  radius = 18;
  azimuth = 0;
  elevation = 0.12;
  private vAz = 0;
  private vEl = 0;
  private vR = 0;
  autoSpin = 0.03; // rad/s when cruise is on

  /** Back to the default pose with no leftover inertia. */
  reset(): void {
    Object.assign(this, new OrbitCamera());
  }

  /** Rotation without touching inertia (keyboard). */
  turn(dAz: number, dEl: number): void {
    this.azimuth += dAz;
    this.elevation = clamp(this.elevation + dEl, -EL_MAX, EL_MAX);
  }

  /** Direct rotation for drags; keeps a bit of the motion as inertia. */
  rotate(dAz: number, dEl: number, dtMs: number): void {
    this.azimuth += dAz;
    this.elevation = clamp(this.elevation + dEl, -EL_MAX, EL_MAX);
    const k = 1000 / Math.max(dtMs, 8);
    this.vAz = dAz * k * 0.6;
    this.vEl = dEl * k * 0.6;
  }

  /** Multiplicative zoom: factor > 1 moves out. */
  zoom(factor: number): void {
    this.radius = clamp(this.radius * factor, R_MIN, R_MAX);
  }

  zoomVelocity(v: number): void {
    this.vR = clamp(this.vR + v, -3, 3); // repeated clicks can't stack into a runaway zoom
  }

  update(dt: number, cruise: boolean): void {
    const damp = Math.exp(-dt * 3.5);
    this.azimuth += this.vAz * dt + (cruise ? this.autoSpin * dt : 0);
    this.elevation = clamp(this.elevation + this.vEl * dt, -EL_MAX, EL_MAX);
    this.radius = clamp(this.radius * Math.exp(this.vR * dt), R_MIN, R_MAX);
    this.vAz *= damp;
    this.vEl *= damp;
    this.vR *= damp;
  }

  position(): Vec3 {
    const c = Math.cos(this.elevation);
    return [this.radius * c * Math.sin(this.azimuth), this.radius * Math.sin(this.elevation), this.radius * c * Math.cos(this.azimuth)];
  }

  /** Column-major mat3 (right, up, forward) looking at the origin. */
  basis(): Float32Array {
    const p = this.position();
    const f = norm([-p[0], -p[1], -p[2]]);
    const rgt = norm(crossV(f, [0, 1, 0]));
    const up = crossV(rgt, f);
    return new Float32Array([...rgt, ...up, ...f]);
  }
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const crossV = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
};
