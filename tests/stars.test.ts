import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { bakeStarFaces, placeStars, dirToFace, faceToDir, galacticToWorld, parseStars, starColor } from "../src/sky/stars";
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
  it("conserves total flux when baking (away from face edges)", () => {
    const one = [{ l: 0.3, b: 0.1, vmag: 0, bv: 0.6 }];
    let sum = 0;
    bakeStarFaces(placeStars(one), 64, (_, f) => {
      for (let i = 1; i < f.length; i += 4) sum += f[i];
    });
    expect(sum / (64 / 512) ** 2).toBeCloseTo(starColor(one[0])[1], 4);
  });
});
