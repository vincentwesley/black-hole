// The shipped quality tiers trace with much coarser steps than the physics tests. What matters on
// screen is how far the sky lands from where it should: the error in the escape direction divided
// by how fast that direction changes across the image (near the shadow edge the sky is squeezed
// into a thin ring, so a large direction error there moves the picture by a tiny angle).
import { describe, expect, it } from "vitest";
import { B_CRIT, cameraRay, escapeRadius, normalize, traceRay, type Vec3 } from "../src/physics/schwarzschild";
import { PRESETS, type PresetName } from "../src/render/quality";

const angle = (a: Vec3, b: Vec3) => Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
const FINE = { maxSteps: 2e6, stepK: 0.002, escapeRadius: 1e4 };

/** Rays from a camera at rCam on +z, at angles from just outside the shadow edge to 80°. */
function sweep(rCam: number) {
  const pos: Vec3 = [0, 0, rCam];
  const edge = Math.asin((B_CRIT * Math.sqrt(1 - 1 / rCam)) / rCam);
  const ray = (al: number) => cameraRay(pos, normalize([Math.sin(al), 0, -Math.cos(al)]));
  const out: { vel: Vec3; b: number; ref: Vec3; dirPerRad: number }[] = [];
  for (let i = 1; i <= 60; i++) {
    const al = edge * (1 + 0.002 * i * i);
    if (al > 1.4) break;
    const { vel, b } = ray(al);
    const ref = traceRay(pos, vel, FINE), next = traceRay(pos, ray(al * (1 + 1e-6)).vel, FINE);
    if (ref.fate !== "escape" || next.fate !== "escape") continue;
    out.push({ vel, b, ref: ref.dir, dirPerRad: angle(ref.dir, next.dir) / (al * 1e-6) });
  }
  return { pos, rays: out };
}

// On-screen error bound per tier (mrad). Low pixels are ~2.3 mrad at 1280 px, High ~0.6.
const BOUND: Record<PresetName, number> = { low: 2, medium: 1, high: 0.4, ultra: 0.2 };

describe("shipped tiers vs a fine reference", () => {
  for (const rCam of [2.2, 6, 18, 60]) {
    const { pos, rays } = sweep(rCam);
    it(`stay within a fraction of a pixel at r = ${rCam} r_s`, () => {
      expect(rays.length).toBeGreaterThan(8);
      for (const [name, p] of Object.entries(PRESETS) as [PresetName, (typeof PRESETS)[PresetName]][]) {
        let worst = 0;
        let unresolved = 0;
        for (const r of rays) {
          const t = traceRay(pos, r.vel, { maxSteps: p.maxSteps, stepK: p.stepK, escapeRadius: escapeRadius(rCam) });
          if (t.fate === "unresolved") {
            // Out of steps: only allowed within 2 % of the critical impact parameter (drawn dark).
            expect(r.b / B_CRIT, `${name} b/b_crit`).toBeLessThan(1.02);
            unresolved++;
            continue;
          }
          expect(t.fate, name).toBe("escape");
          worst = Math.max(worst, angle(t.dir, r.ref) / r.dirPerRad);
        }
        expect(worst * 1e3, `${name} worst on-screen error (mrad)`).toBeLessThan(BOUND[name]);
        expect(unresolved).toBeLessThan(rays.length / 4);
      }
    });
  }

  it("escape radius costs under 0.1 mrad against tracing out to 10^4 r_s", () => {
    for (const rCam of [6, 18, 60]) {
      const { pos, rays } = sweep(rCam);
      for (const r of rays) {
        const t = traceRay(pos, r.vel, { ...FINE, escapeRadius: escapeRadius(rCam) });
        expect(angle(t.dir, r.ref) / r.dirPerRad).toBeLessThan(1e-4);
      }
    }
  });
});
