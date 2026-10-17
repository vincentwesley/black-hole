// Quality presets. Render scale is relative to CSS pixels × devicePixelRatio (capped by maxDpr).
export type PresetName = "low" | "medium" | "high" | "ultra";

export interface Preset {
  label: string;
  renderScale: number;
  maxDpr: number;
  maxSteps: number;
  stepK: number;
  bloomLevels: number;
  skySize: number;
}

export const PRESETS: Record<PresetName, Preset> = {
  low: { label: "Low", renderScale: 0.5, maxDpr: 1, maxSteps: 140, stepK: 0.1, bloomLevels: 0, skySize: 512 },
  medium: { label: "Medium", renderScale: 0.75, maxDpr: 1.5, maxSteps: 220, stepK: 0.07, bloomLevels: 5, skySize: 512 },
  high: { label: "High", renderScale: 1, maxDpr: 2, maxSteps: 320, stepK: 0.045, bloomLevels: 6, skySize: 1024 },
  ultra: { label: "Ultra", renderScale: 1, maxDpr: 3, maxSteps: 600, stepK: 0.025, bloomLevels: 7, skySize: 1024 },
};

export const PRESET_ORDER: PresetName[] = ["low", "medium", "high", "ultra"];

export function isPreset(v: unknown): v is PresetName {
  return typeof v === "string" && v in PRESETS;
}

/** Drawing-buffer size for a CSS size, preset and device pixel ratio. */
export function bufferSize(cssW: number, cssH: number, dpr: number, p: Preset): [number, number] {
  const s = Math.min(dpr, p.maxDpr) * p.renderScale;
  return [Math.max(1, Math.round(cssW * s)), Math.max(1, Math.round(cssH * s))];
}

/** Picks a starting preset from rough device hints; the frame-time governor refines it later. */
export function initialPreset(hints: { mobile: boolean; software: boolean; cores: number }): PresetName {
  if (hints.software) return "low";
  if (hints.mobile || hints.cores <= 4) return "medium";
  return "high";
}

/**
 * Steps down one preset when frames stay slow. Keeps a rolling mean of frame times; never steps up
 * on its own (the user can), so it cannot oscillate.
 */
export class Governor {
  private samples: number[] = [];
  constructor(private budgetMs = 34, private window = 45) {}
  reset(): void {
    this.samples = [];
  }
  /** Feed one frame time; returns true when the caller should drop a preset. */
  push(ms: number): boolean {
    this.samples.push(ms);
    if (this.samples.length < this.window) return false;
    const mean = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    this.samples = [];
    return mean > this.budgetMs;
  }
}
