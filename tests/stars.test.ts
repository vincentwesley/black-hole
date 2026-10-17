import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  bakeStarFaces, dirToFace, faceToDir, galacticToUv, galacticToWorld, MILKY_WAY_SCALE, parseStars, placeStars, starColor,
  texelSolidAngle, worldToGalacticMatrix,
} from "../src/sky/stars";
import { normalize, type Vec3 } from "../src/physics/schwarzschild";

describe("cubemap mapping", () => {
  it("round-trips directions through every face", () => {
    const dirs: Vec3[] = [[1, 0.2, -0.3], [-1, 0.5, 0.1], [0.1, 1, 0.4], [0.3, -1, -0.2], [0.2, 0.1, 1], [-0.4, 0.3, -1]];
    dirs.forEach((d, i) => {
      const { face, s, t } = dirToFace(d);
      expect(face).toBe(i);
      const back = normalize(faceToDir(face, s, t));
      normalize(d).forEach((c, k) => expect(back[k]).toBeCloseTo(c, 9));
    });
  });
});

describe("star catalogue", () => {
  const stars = parseStars(new Uint8Array(readFileSync("public/data/stars.bin")).buffer);
  it("contains the BSC5 stars with Sirius as the brightest", () => {
    expect(stars.length).toBeGreaterThan(9000);
    const sirius = stars.reduce((a, b) => (b.vmag < a.vmag ? b : a));
    expect(sirius.vmag).toBeCloseTo(-1.46, 2);
    expect((sirius.l * 180) / Math.PI).toBeCloseTo(227.2, 0);
  });
  it("places the galactic centre behind the hole (world -z)", () => {
    const d = galacticToWorld(0, 0);
    expect(d[2]).toBeCloseTo(-1, 9);
  });
  it("colours hot stars blue and cool stars red, with V = 0 at unit luminance", () => {
    const hot = starColor({ l: 0, b: 0, vmag: 0, bv: -0.2 });
    const cool = starColor({ l: 0, b: 0, vmag: 0, bv: 1.5 });
    expect(hot[2]).toBeGreaterThan(hot[0]);
    expect(cool[0]).toBeGreaterThan(cool[2]);
    expect(0.2126 * hot[0] + 0.7152 * hot[1] + 0.0722 * hot[2]).toBeCloseTo(1, 6);
  });
  it("conserves flux when baking, after the solid-angle weight (away from face edges)", () => {
    const one = [{ l: 0.3, b: 0.1, vmag: 0, bv: 0.6 }];
    const { s, t } = dirToFace(galacticToWorld(0.3, 0.1));
    let sum = 0;
    bakeStarFaces(placeStars(one), 64, (_, f) => {
      for (let i = 1; i < f.length; i += 4) sum += f[i];
    });
    expect((sum * texelSolidAngle(s, t)) / (64 / 512) ** 2).toBeCloseTo(starColor(one[0])[1], 4);
  });
});

describe("Milky Way map", () => {
  it("weights face corners by the texel solid angle 3^-1.5", () => {
    expect(texelSolidAngle(0.5, 0.5)).toBe(1);
    expect(texelSolidAngle(0, 1)).toBeCloseTo(3 ** -1.5, 12);
  });
  it("puts the Large Magellanic Cloud where the NASA SVS galactic map shows it", () => {
    // LMC: l = 280.5°, b = -32.9°; in the 1024x512 print it sits near pixel (740, 350).
    const [u, v] = galacticToUv((280.5 * Math.PI) / 180, (-32.9 * Math.PI) / 180);
    expect(u * 1024).toBeCloseTo(740, -1);
    expect(v * 512).toBeCloseTo(350, -1);
  });
  it("world -> galactic matrix inverts galacticToWorld", () => {
    const m = worldToGalacticMatrix();
    const l = 1.1, b = -0.4;
    const w = galacticToWorld(l, b);
    const g = [0, 1, 2].map((r) => m[r] * w[0] + m[3 + r] * w[1] + m[6 + r] * w[2]);
    expect(Math.atan2(g[1], g[0])).toBeCloseTo(l, 6);
    expect(Math.asin(g[2])).toBeCloseTo(b, 6);
  });
  it("calibrates texture value 1 to ~20.5 mag/arcsec² in star units", () => {
    expect(MILKY_WAY_SCALE).toBeGreaterThan(0.003);
    expect(MILKY_WAY_SCALE).toBeLessThan(0.005);
  });
});
