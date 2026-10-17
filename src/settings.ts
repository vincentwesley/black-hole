// User-facing settings, the two looks, and persistence (per-viewer convenience only).
import { isPreset, type PresetName } from "./render/quality";

export type Look = "physical" | "interstellar";

export interface Settings {
  look: Look;
  quality: PresetName;
  auto: boolean;
  doppler: boolean;
  gravity: boolean;
  cruise: boolean;
  temp: number;
  outer: number;
  exposure: number;
  bloom: number;
}

export const DEFAULTS: Settings = {
  look: "physical",
  quality: "high",
  auto: true,
  doppler: true,
  gravity: true,
  cruise: true,
  temp: 5800,
  outer: 12,
  exposure: 0.45,
  bloom: 0.6,
};

/** What each look changes. The film look drops all frequency shifts (James et al. 2015, §4.2). */
export const LOOKS: Record<Look, Partial<Settings>> = {
  physical: { doppler: true, gravity: true, temp: 5800, exposure: 0.45, bloom: 0.6 },
  interstellar: { doppler: false, gravity: false, temp: 4300, exposure: 0.6, bloom: 0.8 },
};

const KEY = "bh-settings";

/** Merges stored JSON over defaults, keeping only known keys with the right types and ranges. */
export function sanitize(raw: unknown): Settings {
  const out = { ...DEFAULTS };
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  if (r.look === "physical" || r.look === "interstellar") out.look = r.look;
  if (isPreset(r.quality)) out.quality = r.quality;
  for (const k of ["auto", "doppler", "gravity", "cruise"] as const) if (typeof r[k] === "boolean") out[k] = r[k];
  const num = (k: "temp" | "outer" | "exposure" | "bloom", lo: number, hi: number) => {
    const v = r[k];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = Math.min(hi, Math.max(lo, v));
  };
  num("temp", 2500, 20000);
  num("outer", 5, 25);
  num("exposure", 0.05, 3);
  num("bloom", 0, 1);
  return out;
}

export function loadSettings(): { settings: Settings; stored: boolean } {
  try {
    const s = localStorage.getItem(KEY);
    return { settings: sanitize(s ? JSON.parse(s) : null), stored: s !== null };
  } catch {
    return { settings: { ...DEFAULTS }, stored: false };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage blocked: settings just won't persist */
  }
}
