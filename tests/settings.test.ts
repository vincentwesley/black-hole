import { describe, expect, it } from "vitest";
import { DEFAULTS, LOOKS, sanitize } from "../src/settings";
import { bufferSize, Governor, initialPreset, PRESETS } from "../src/render/quality";
import { OrbitCamera, R_MAX, R_MIN } from "../src/camera";

describe("settings", () => {
  it("falls back to defaults for junk and clamps ranges", () => {
    expect(sanitize("nope")).toEqual(DEFAULTS);
    const s = sanitize({ look: "interstellar", quality: "ultra", temp: 1e9, bloom: -3, doppler: "yes", extra: 1 });
    expect(s.look).toBe("interstellar");
    expect(s.quality).toBe("ultra");
    expect(s.temp).toBe(20000);
    expect(s.bloom).toBe(0);
    expect(s.doppler).toBe(true);
    expect("extra" in s).toBe(false);
  });
  it("film look removes every frequency shift", () => {
    expect(LOOKS.interstellar.doppler).toBe(false);
    expect(LOOKS.interstellar.gravity).toBe(false);
  });
});

describe("quality", () => {
  it("scales the buffer by preset and caps the pixel ratio", () => {
    expect(bufferSize(1000, 500, 3, PRESETS.low)).toEqual([500, 250]);
    expect(bufferSize(1000, 500, 3, PRESETS.high)).toEqual([2000, 1000]);
  });
  it("starts low on software renderers", () => {
    expect(initialPreset({ mobile: false, software: true, cores: 16 })).toBe("low");
    expect(initialPreset({ mobile: true, software: false, cores: 8 })).toBe("medium");
    expect(initialPreset({ mobile: false, software: false, cores: 8 })).toBe("high");
  });
  it("governor asks to step down only after a slow window", () => {
    const g = new Governor(30, 5);
    for (let i = 0; i < 4; i++) expect(g.push(50)).toBe(false);
    expect(g.push(50)).toBe(true);
    for (let i = 0; i < 4; i++) g.push(10);
    expect(g.push(10)).toBe(false);
  });
});

describe("camera", () => {
  it("clamps zoom and builds an orthonormal basis facing the hole", () => {
    const c = new OrbitCamera();
    c.zoom(1e-6);
    expect(c.radius).toBe(R_MIN);
    c.zoom(1e9);
    expect(c.radius).toBe(R_MAX);
    c.azimuth = 0.7;
    c.elevation = 0.4;
    const m = c.basis();
    const p = c.position();
    const f = [m[6], m[7], m[8]];
    const pl = Math.hypot(...p);
    f.forEach((v, i) => expect(v).toBeCloseTo(-p[i] / pl, 6));
    expect(m[0] * m[3] + m[1] * m[4] + m[2] * m[5]).toBeCloseTo(0, 6);
  });
});
