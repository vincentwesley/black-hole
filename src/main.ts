import "./style.css";
import "./credits/credits.js";
import { applyTheme, nextTheme, type Theme } from "./theme";
import { OrbitCamera } from "./camera";
import { Renderer, type SceneParams } from "./render/renderer";
import { bufferSize, Governor, initialPreset, PRESET_ORDER, PRESETS, type PresetName } from "./render/quality";
import { LOOKS, loadSettings, saveSettings, type Look, type Settings } from "./settings";
import { parseStars } from "./sky/stars";

// ---- theme (page chrome only; the render is always dark) ----
const THEME_KEY = "theme";
const themeStore = {
  get: (): Theme => {
    try {
      return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  },
  set: (t: Theme) => {
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      /* storage blocked: theme just won't persist */
    }
  },
};
const themeBtn = document.querySelector<HTMLButtonElement>("#theme")!;
function syncTheme(t: Theme): void {
  applyTheme(t);
  themeBtn.setAttribute("aria-pressed", String(t === "light"));
  themeBtn.textContent = t === "light" ? "Dark theme" : "Light theme";
}
syncTheme(themeStore.get());
themeBtn.addEventListener("click", () => {
  const t = nextTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  themeStore.set(t);
  syncTheme(t);
});

// ---- settings form ----
const form = document.querySelector<HTMLFormElement>("#controls")!;
const panel = document.querySelector<HTMLDetailsElement>("#panel")!;
const loaded = loadSettings();
const settings: Settings = loaded.settings;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
if (!loaded.stored && reducedMotion) settings.cruise = false;
if (matchMedia("(max-width: 720px)").matches) panel.open = false;

const field = <T = HTMLInputElement>(name: string) => form.elements.namedItem(name) as unknown as T;
const outputs = {
  temp: field<HTMLOutputElement>("o-temp"),
  outer: field<HTMLOutputElement>("o-outer"),
  exposure: field<HTMLOutputElement>("o-exp"),
  bloom: field<HTMLOutputElement>("o-bloom"),
};

function writeForm(): void {
  field<RadioNodeList>("look").value = settings.look;
  field<RadioNodeList>("quality").value = settings.quality;
  for (const k of ["auto", "doppler", "gravity", "cruise"] as const) field(k).checked = settings[k];
  for (const k of ["temp", "outer", "exposure", "bloom"] as const) field(k).value = String(settings[k]);
  outputs.temp.textContent = `${settings.temp} K`;
  outputs.outer.innerHTML = `${settings.outer} r<sub>s</sub>`;
  outputs.exposure.textContent = settings.exposure.toFixed(2);
  outputs.bloom.textContent = settings.bloom.toFixed(2);
}

function readForm(e: Event): void {
  const t = e.target as HTMLInputElement;
  if (t.name === "look") {
    settings.look = t.value as Look;
    Object.assign(settings, LOOKS[settings.look]);
  } else if (t.name === "quality") {
    settings.quality = t.value as PresetName;
    applyPreset();
  } else if (t.type === "checkbox") {
    (settings as unknown as Record<string, boolean>)[t.name] = t.checked;
  } else if (t.type === "range") {
    (settings as unknown as Record<string, number>)[t.name] = Number(t.value);
  }
  writeForm();
  saveSettings(settings);
}
form.addEventListener("input", readForm);
writeForm();

// ---- renderer ----
const canvas = document.querySelector<HTMLCanvasElement>("#view")!;
const stats = { r: document.querySelector("#s-r")!, fps: document.querySelector("#s-fps")!, q: document.querySelector("#s-q")! };
const cam = new OrbitCamera();
const governor = new Governor();
let renderer: Renderer | null = null;

function showFallback(msg?: string): void {
  const fb = document.querySelector<HTMLElement>("#fallback")!;
  fb.hidden = false;
  if (msg) document.querySelector("#fallback-msg")!.textContent = msg;
  canvas.hidden = true;
  document.querySelector<HTMLElement>("#stats")!.hidden = true;
  document.querySelector<HTMLElement>("#hint")!.hidden = true;
  document.body.dataset.render = "fallback";
}

try {
  renderer = new Renderer(canvas, PRESETS[settings.quality]);
} catch (err) {
  console.warn(err);
  showFallback();
}

function applyPreset(): void {
  if (!renderer) return;
  renderer.setPreset(PRESETS[settings.quality]);
  governor.reset();
  stats.q.textContent = PRESETS[settings.quality].label;
  resize();
}

function resize(): void {
  if (!renderer) return;
  const rect = canvas.getBoundingClientRect();
  const [w, h] = bufferSize(rect.width, rect.height, devicePixelRatio || 1, PRESETS[settings.quality]);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

if (renderer) {
  if (!loaded.stored) {
    const info = renderer.info();
    settings.quality = initialPreset({
      mobile: matchMedia("(pointer: coarse)").matches,
      software: /swiftshader|llvmpipe|software|basic render/i.test(info.renderer),
      cores: navigator.hardwareConcurrency || 4,
    });
    writeForm();
  }
  applyPreset();
  new ResizeObserver(resize).observe(canvas);
  fetch(new URL("data/stars.bin", document.baseURI))
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`stars: HTTP ${r.status}`))))
    .then((buf) => renderer!.setStars(parseStars(buf)))
    .catch((err) => console.warn(err));
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    showFallback("The graphics context was lost. Reload the page to restart the render.");
    renderer = null;
  });
}

// ---- input ----
const pointers = new Map<number, { x: number; y: number }>();
let lastPinch = 0;
let lastMove = performance.now();
canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  lastPinch = 0;
});
canvas.addEventListener("pointermove", (e) => {
  const prev = pointers.get(e.pointerId);
  if (!prev) return;
  const now = performance.now();
  if (pointers.size === 1) {
    const s = 3.2 / Math.max(canvas.clientHeight, 1);
    cam.rotate(-(e.clientX - prev.x) * s, (e.clientY - prev.y) * s, now - lastMove);
  }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (lastPinch) cam.zoom(lastPinch / d);
    lastPinch = d;
  }
  lastMove = now;
});
const endPointer = (e: PointerEvent) => {
  pointers.delete(e.pointerId);
  lastPinch = 0;
};
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const px = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1); // lines / pages -> pixels
  cam.zoom(Math.exp(Math.sign(px) * Math.min(Math.abs(px), 200) * 0.0015));
}, { passive: false });

const keys = new Set<string>();
// Physical key codes, so Shift (+ vs =) can't strand a key in the set.
const HELD = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyW", "KeyA", "KeyS", "KeyD", "Equal", "NumpadAdd", "Minus", "NumpadSubtract"];
canvas.addEventListener("keydown", (e) => {
  const k = e.code;
  if (k === "Space") {
    settings.cruise = !settings.cruise;
    writeForm();
    saveSettings(settings);
  } else if (k === "KeyR") cam.reset();
  else if (HELD.includes(k)) keys.add(k);
  else return;
  e.preventDefault();
});
canvas.addEventListener("keyup", (e) => keys.delete(e.code));
canvas.addEventListener("blur", () => keys.clear());

function applyKeys(dt: number): void {
  const rot = 1.2 * dt;
  const on = (...ks: string[]) => ks.some((k) => keys.has(k));
  if (on("ArrowLeft", "KeyA")) cam.turn(-rot, 0);
  if (on("ArrowRight", "KeyD")) cam.turn(rot, 0);
  if (on("ArrowUp", "KeyW")) cam.turn(0, rot);
  if (on("ArrowDown", "KeyS")) cam.turn(0, -rot);
  if (on("Equal", "NumpadAdd")) cam.zoom(Math.exp(-dt * 0.9));
  if (on("Minus", "NumpadSubtract")) cam.zoom(Math.exp(dt * 0.9));
}

document.querySelector("#reset")!.addEventListener("click", () => cam.reset());

// ---- frame loop ----
let simTime = 0;
let last = performance.now();
let fpsAcc = 0, fpsFrames = 0;
let visible = true;
new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(canvas);

function params(): SceneParams {
  return {
    camPos: cam.position(),
    camBasis: cam.basis(),
    fovY: (canvas.clientWidth < canvas.clientHeight ? 75 : 55) * (Math.PI / 180),
    time: simTime,
    tempPeak: settings.temp,
    diskOuter: settings.outer,
    doppler: settings.doppler,
    gravity: settings.gravity,
    bloom: settings.bloom,
    exposure: settings.exposure,
    starGain: 6,
  };
}

function frame(now: number): void {
  requestAnimationFrame(frame);
  const dtMs = Math.min(now - last, 100);
  last = now;
  if (!renderer || !visible || document.hidden) return;
  const dt = dtMs / 1000;
  if (!reducedMotion) simTime += dt;
  applyKeys(dt);
  cam.update(dt, settings.cruise);
  renderer.render(params());

  fpsAcc += dtMs;
  fpsFrames++;
  if (fpsAcc > 500) {
    stats.fps.textContent = String(Math.round((fpsFrames * 1000) / fpsAcc));
    stats.r.textContent = cam.radius.toFixed(1);
    fpsAcc = 0;
    fpsFrames = 0;
  }
  if (settings.auto && governor.push(dtMs)) {
    const i = PRESET_ORDER.indexOf(settings.quality);
    if (i > 0) {
      settings.quality = PRESET_ORDER[i - 1];
      writeForm();
      applyPreset();
    }
  }
}
requestAnimationFrame(frame);

// ---- snapshot ----
document.querySelector("#snap")!.addEventListener("click", () => {
  if (!renderer) return;
  const px = renderer.readPixels(params());
  const w = canvas.width, h = canvas.height;
  const c2 = document.createElement("canvas");
  c2.width = w;
  c2.height = h;
  const ctx = c2.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  ctx.putImageData(img, 0, 0);
  c2.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `black-hole-${Date.now()}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, "image/png");
});

// Test hook: lets e2e read back a frame without preserveDrawingBuffer.
declare global {
  interface Window {
    __bh?: { ready: () => boolean; setCamera: (c: Partial<Pick<OrbitCamera, "radius" | "azimuth" | "elevation">>) => void; sample: () => { w: number; h: number; mean: number; nonBlack: number; info: ReturnType<Renderer["info"]> } | null };
  }
}
window.__bh = {
  ready: () => !!renderer,
  setCamera: (c) => Object.assign(cam, c),
  sample: () => {
    if (!renderer) return null;
    const px = renderer.readPixels(params());
    let sum = 0, nonBlack = 0;
    for (let i = 0; i < px.length; i += 4) {
      const l = px[i] + px[i + 1] + px[i + 2];
      sum += l;
      if (l > 30) nonBlack++;
    }
    return { w: canvas.width, h: canvas.height, mean: sum / (px.length / 4) / 3, nonBlack: nonBlack / (px.length / 4), info: renderer.info() };
  },
};
