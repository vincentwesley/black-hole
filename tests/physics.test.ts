import { describe, expect, it } from "vitest";
import { B_CRIT, cameraRay, diskRedshift, ISCO, keplerOmega, normalize, traceRay, type Vec3 } from "../src/physics/schwarzschild";
import { novikovThorneFlux, temperatureTable } from "../src/physics/disk";
import { blackbodyTable, bvToKelvin, xyzToLinearSrgb, blackbodyXYZ } from "../src/physics/color";

// A ray far away with impact parameter b, travelling along +x.
const farRay = (b: number): [Vec3, Vec3] => [[-1000, 0, b], [1, 0, 0]];
const opts = { maxSteps: 4000, stepK: 0.02, escapeRadius: 1e4 };

describe("geodesics", () => {
  it("captures rays just inside the critical impact parameter and frees those just outside", () => {
    expect(traceRay(...farRay(B_CRIT * 0.995), opts).fate).toBe("horizon");
    expect(traceRay(...farRay(B_CRIT * 1.005), opts).fate).toBe("escape");
  });

  it("matches the weak-field deflection 2 r_s / b (Einstein 1915) at large b", () => {
    for (const b of [200, 400]) {
      const res = traceRay([-20000, 0, b], [1, 0, 0], { maxSteps: 20000, stepK: 0.01, escapeRadius: 2e4 });
      const defl = Math.atan2(-res.dir[2], res.dir[0]);
      expect(defl / (2 / b)).toBeCloseTo(1, 1);
    }
  });

  it("matches the strong-field deflection of an exact integral at b = 3", () => {
    // Exact: Δφ = 2 ∫_0^{u0} du / sqrt(1/b^2 - u^2 (1 - u)), deflection = Δφ - π.
    const b = 3;
    let u0 = 0.3;
    for (let i = 0; i < 60; i++) u0 -= (u0 * u0 * (1 - u0) - 1 / (b * b)) / (2 * u0 - 3 * u0 * u0);
    // Substitute u = u0 (1 - t^2) to remove the endpoint singularity.
    const N = 200000;
    let dphi = 0;
    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) / N;
      const u = u0 * (1 - t * t);
      dphi += (2 * u0 * t) / Math.sqrt(1 / (b * b) - u * u * (1 - u)) / N;
    }
    const exact = 2 * dphi - Math.PI;
    const res = traceRay([-5000, 0, b], [1, 0, 0], { maxSteps: 20000, stepK: 0.005, escapeRadius: 5000 });
    const defl = Math.atan2(-res.dir[2], res.dir[0]);
    const measured = defl < 0 ? defl + 2 * Math.PI : defl;
    expect(Math.abs(measured - exact)).toBeLessThan(0.02);
  });

  it("records equatorial crossings for a ray that loops past the disk plane", () => {
    const res = traceRay([0, 6, -20], normalize([0, -0.05, 1]), { maxSteps: 2000, stepK: 0.02, escapeRadius: 100 });
    expect(res.crossings.length).toBeGreaterThan(0);
  });
});

describe("camera rays", () => {
  it("gives b = r sin α / sqrt(1 - r_s/r) and the Kerr-free critical angle", () => {
    const r = 10;
    const { b } = cameraRay([0, 0, r], normalize([1, 0, -1]));
    expect(b).toBeCloseTo((r * Math.SQRT1_2) / Math.sqrt(1 - 1 / r), 6);
  });

  it("sign of λ follows the photon's orbit sense about +y", () => {
    // Camera on +z looking at -z, ray aimed to +x: the traced ray swings counter-clockwise seen from +y?
    const a = cameraRay([0, 0, 20], normalize([0.3, 0, -1]));
    const b = cameraRay([0, 0, 20], normalize([-0.3, 0, -1]));
    expect(Math.sign(a.lambda)).toBe(-Math.sign(b.lambda));
    expect(Math.abs(a.lambda)).toBeCloseTo(Math.abs(b.lambda), 10);
  });
});

describe("disk redshift", () => {
  it("is pure gravitational + time dilation for λ = 0", () => {
    expect(diskRedshift(6, 0, 1e12)).toBeCloseTo(Math.sqrt(1 - 1.5 / 6), 6);
  });
  it("blueshifts gas moving toward the observer (Ωλ > 0)", () => {
    expect(diskRedshift(6, 5, 1e12)).toBeGreaterThan(diskRedshift(6, -5, 1e12));
    expect(diskRedshift(6, 5, 1e12)).toBeCloseTo(Math.sqrt(0.75) / (1 - keplerOmega(6) * 5), 6);
  });
});

describe("Novikov-Thorne disk", () => {
  it("vanishes at the ISCO and peaks near r = 9.55 M (4.77 r_s)", () => {
    const radii = Array.from({ length: 2000 }, (_, i) => ISCO + i * 0.005);
    const f = novikovThorneFlux(radii);
    expect(f[0]).toBe(0);
    const peak = radii[f.indexOf(Math.max(...f))];
    expect(peak).toBeGreaterThan(4.6);
    expect(peak).toBeLessThan(4.95);
  });
  it("approaches the Newtonian r^-3 (1 - sqrt(r_in / r)) law far out", () => {
    const [a, b] = novikovThorneFlux([200, 400]);
    const newton = (r: number) => (1 - Math.sqrt(ISCO / r)) / r ** 3;
    expect(a / b / (newton(200) / newton(400))).toBeCloseTo(1, 1);
  });
  it("normalises the temperature table to a maximum of 1", () => {
    const t = temperatureTable();
    expect(Math.max(...t.values)).toBeCloseTo(1, 6);
    expect(t.values[0]).toBe(0);
  });
});

describe("blackbody colours", () => {
  it("D65-ish white near 6500 K, red when cool, blue when hot", () => {
    const rgb = (T: number) => xyzToLinearSrgb(blackbodyXYZ(T));
    const [r1, , b1] = rgb(3000);
    const [r2, , b2] = rgb(20000);
    expect(r1).toBeGreaterThan(b1);
    expect(b2).toBeGreaterThan(r2);
    const [r, g, b] = rgb(6500);
    expect(Math.max(r, g, b) / Math.min(r, g, b)).toBeLessThan(1.25);
  });
  it("luminance grows with temperature in the table", () => {
    const t = blackbodyTable();
    for (let i = 1; i < t.size; i++) expect(t.data[i * 4 + 3]).toBeGreaterThan(t.data[(i - 1) * 4 + 3]);
  });
  it("maps B-V to temperature (Sun B-V 0.65 ≈ 5800 K)", () => {
    expect(bvToKelvin(0.65)).toBeGreaterThan(5500);
    expect(bvToKelvin(0.65)).toBeLessThan(6000);
  });
});
