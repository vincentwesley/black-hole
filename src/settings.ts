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
  milkyWay: boolean;
  overlay: boolean;
  temp: number;
  outer: number;
  exposure: number;
  bloom: number;
  sky: number;
}

export const DEFAULTS: Settings = {
  look: "physical",
  quality: "high",
  auto: true,
  doppler: true,
  gravity: true,
  cruise: true,
  milkyWay: true,
  overlay: false,
  temp: 5800,
  outer: 12,
  exposure: 0.45,
  bloom: 0.6,
  sky: 2.5,
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
  for (const k of ["auto", "doppler", "gravity", "cruise", "milkyWay", "overlay"] as const) if (typeof r[k] === "boolean") out[k] = r[k];
  const num = (k: "temp" | "outer" | "exposure" | "bloom" | "sky", lo: number, hi: number) => {
    const v = r[k];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = Math.min(hi, Math.max(lo, v));
  };
  num("temp", 2500, 20000);
  num("outer", 5, 25);
  num("exposure", 0.05, 3);
  num("bloom", 0, 1);
  num("sky", 0, 5);
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

// ---- share link: the view and key settings live in location.hash, written only on "Copy link" ----
export interface View {
  radius: number;
  azimuth: number;
  elevation: number;
}
const BOOLS = ["auto", "doppler", "gravity", "cruise", "milkyWay", "overlay"] as const;
const NUMS = ["temp", "outer", "exposure", "bloom", "sky"] as const;

export function encodeView(s: Settings, v: View): string {
  const p = new URLSearchParams({ r: v.radius.toFixed(2), az: v.azimuth.toFixed(3), el: v.elevation.toFixed(3), look: s.look, q: s.quality });
  for (const k of BOOLS) p.set(k, s[k] ? "1" : "0");
  for (const k of NUMS) p.set(k, String(s[k]));
  return p.toString();
}

/** Reads a share hash. Settings are sanitised over `base`; the view is returned only when all three numbers are valid. */
export function decodeView(hash: string, base: Settings): { settings: Settings; view: View | null; hasQuality: boolean } {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const raw: Record<string, unknown> = { ...base };
  for (const k of ["look", "q"]) if (p.has(k)) raw[k === "q" ? "quality" : k] = p.get(k);
  for (const k of BOOLS) if (p.get(k) === "1" || p.get(k) === "0") raw[k] = p.get(k) === "1";
  for (const k of NUMS) if (p.has(k)) raw[k] = p.get(k) === "" ? NaN : Number(p.get(k));
  const [radius, azimuth, elevation] = ["r", "az", "el"].map((k) => (p.get(k) === null || p.get(k) === "" ? NaN : Number(p.get(k))));
  const ok = [radius, azimuth, elevation].every(Number.isFinite);
  return { settings: sanitize(raw), view: ok ? { radius, azimuth, elevation } : null, hasQuality: isPreset(p.get("q")) };
}
