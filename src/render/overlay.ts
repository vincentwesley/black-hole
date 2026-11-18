// Educational overlay labels: text atlas and screen anchors. The rings themselves are drawn per
// pixel in scene.frag; here the CPU traces a few rays to find where to pin each label.
import { B_CRIT, cameraRay, escapeRadius, normalize, PHOTON_SPHERE, ISCO, traceRay, type Vec3 } from "../physics/schwarzschild";

/** Order matches the overlay kinds in scene.frag (1 shadow edge, 2 photon sphere, 3 ISCO). */
export const LABELS = ["Shadow edge, b = 3√3 M (exact)", "Photon sphere r = 3M (equator, lensed)", "ISCO r = 6M (lensed)"];
const COLORS = ["#a996e0", "#e9a07f", "#4fe0a0"];

export interface Atlas {
  canvas: HTMLCanvasElement;
  /** Per label: text width and row height in atlas pixels. */
  widths: number[];
  row: number;
}

export function buildAtlas(fontPx: number): Atlas {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const font = `600 ${fontPx}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.font = font;
  const pad = Math.ceil(fontPx * 0.3);
  const widths = LABELS.map((t) => Math.ceil(ctx.measureText(t).width) + 2 * pad);
  const row = Math.ceil(fontPx * 1.6);
  canvas.width = Math.max(...widths);
  canvas.height = row * LABELS.length;
  ctx.font = font; // resizing resets the context
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2, fontPx / 4);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
  LABELS.forEach((t, i) => {
    ctx.strokeText(t, pad, row * (i + 0.5));
    ctx.fillStyle = COLORS[i];
    ctx.fillText(t, pad, row * (i + 0.5));
  });
  return { canvas, widths, row };
}

/**
 * Ray-NDC anchor for each label (before the principal-point shift), or null when not found:
 * the shadow edge's leftmost point (exact), and the points on the vertical through the hole
 * where the first disk-plane crossing passes the photon-sphere and ISCO radii.
 */
export function anchors(camPos: Vec3, basis: Float32Array, tan: [number, number], steps: { maxSteps: number; stepK: number }): ([number, number] | null)[] {
  const r0 = Math.hypot(...camPos);
  const edge = Math.asin(Math.min(1, (B_CRIT * Math.sqrt(1 - 1 / r0)) / r0));
  const opts = { ...steps, escapeRadius: escapeRadius(r0) };
  const first = (ny: number): number => {
    const d = [0, 1, 2].map((k) => basis[3 + k] * ny * tan[1] + basis[6 + k]) as Vec3;
    return traceRay(camPos, cameraRay(camPos, normalize(d)).vel, opts).crossings[0]?.r ?? 0;
  };
  const N = 48;
  const ys = Array.from({ length: 2 * N + 1 }, (_, i) => (i - N) / N);
  const rs = ys.map(first);
  const find = (R: number): [number, number] | null => {
    // Upward from the centre first, then downward.
    for (const dirn of [1, -1]) {
      for (let i = N; i !== N + dirn * N; i += dirn) {
        const a = rs[i], b = rs[i + dirn];
        if (a > 0 && b > 0 && (a - R) * (b - R) <= 0 && a !== b) return [0, ys[i] + ((R - a) / (b - a)) * (ys[i + dirn] - ys[i])];
      }
    }
    return null;
  };
  return [[-Math.tan(edge) / tan[0], 0], find(PHOTON_SPHERE), find(ISCO)];
}
