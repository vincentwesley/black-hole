import { describe, expect, it } from "vitest";
import { Accumulator, halton, jitter } from "../src/render/accum";

describe("jitter sequence", () => {
  it("is the Halton radical inverse", () => {
    expect([1, 2, 3, 4].map((i) => halton(i, 2))).toEqual([0.5, 0.25, 0.75, 0.125]);
    expect(halton(1, 3)).toBeCloseTo(1 / 3);
    expect(halton(5, 3)).toBeCloseTo(7 / 9);
  });

  it("starts at the pixel centre and stays inside the pixel", () => {
    expect(jitter(0)).toEqual([0, 0]);
    for (let n = 1; n < 256; n++) for (const v of jitter(n)) expect(Math.abs(v)).toBeLessThan(0.5 + 1e-12);
  });

  it("covers the pixel evenly (low discrepancy)", () => {
    const q = [0, 0, 0, 0];
    for (let n = 1; n <= 64; n++) {
      const [x, y] = jitter(n);
      q[(x < 0 ? 0 : 1) + (y < 0 ? 0 : 2)]++;
    }
    for (const c of q) expect(Math.abs(c - 16)).toBeLessThanOrEqual(2);
  });
});

describe("Accumulator", () => {
  it("averages: weight 1/(n+1), then stops at the cap", () => {
    const a = new Accumulator(3);
    const key = [1, 2, 3];
    expect(a.next(key)).toEqual({ index: 0, weight: 1 });
    expect(a.next(key)).toEqual({ index: 1, weight: 1 / 2 });
    expect(a.converged(key)).toBe(false);
    expect(a.next(key)).toEqual({ index: 2, weight: 1 / 3 });
    expect(a.converged(key)).toBe(true);
    expect(a.next(key).weight).toBe(0);
    expect(a.n).toBe(3);
  });

  it("restarts instantly when the view changes", () => {
    const a = new Accumulator(8);
    for (let i = 0; i < 5; i++) a.next([0, 0]);
    expect(a.next([0, 0.01])).toEqual({ index: 0, weight: 1 });
    expect(a.converged([0, 0])).toBe(false);
  });

  it("ignores sub-tolerance noise but not a slow drift past it", () => {
    const a = new Accumulator(100);
    a.next([1]);
    a.next([1 + 1e-7]);
    expect(a.n).toBe(2);
    let v = 1;
    for (let i = 0; i < 20; i++) a.next([(v += 2e-6)]); // each step tiny, total 4e-5
    expect(a.n).toBeLessThan(20);
  });

  it("restarts after reset() and on a different key length", () => {
    const a = new Accumulator(4);
    a.next([1]);
    a.next([1]);
    a.reset();
    expect(a.next([1]).weight).toBe(1);
    a.next([1]);
    expect(a.next([1, 0]).weight).toBe(1);
  });
});
