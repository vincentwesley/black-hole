import "./style.css";
import "./credits/credits.js";
import { applyTheme, nextTheme, type Theme } from "./theme";
import { OrbitCamera } from "./camera";
import { Renderer, type SceneParams } from "./render/renderer";
import { bufferSize, Governor, initialPreset, PRESET_ORDER, PRESETS, type PresetName } from "./render/quality";
import { DEFAULTS, LOOKS, loadSettings, saveSettings, type Look, type Settings } from "./settings";
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
const coarsePointer = matchMedia("(pointer: coarse)").matches;
if (!loaded.stored && reducedMotion) settings.cruise = false;

// The panel starts open only where it fits beside the render; afterwards it keeps the viewer's choice.
const PANEL_KEY = "bh-panel";
const storedPanel = (() => {
  try {
    return localStorage.getItem(PANEL_KEY);
  } catch {
    return null;
  }
})();
panel.open = storedPanel ? storedPanel === "open" : innerWidth >= 1100 && innerHeight >= 700;
// Only a viewer's own click is remembered; the size-based default above also fires "toggle".
let panelClicked = false;
panel.querySelector(":scope > summary")!.addEventListener("click", () => (panelClicked = true));
panel.addEventListener("toggle", () => {
  if (!panelClicked) return;
  panelClicked = false;
  try {
    localStorage.setItem(PANEL_KEY, panel.open ? "open" : "closed");
  } catch {
    /* storage blocked: the panel just won't remember */
  }
});

const lookHelp = document.querySelector("#look-help")!;
/** Describes what is actually on, so the line never contradicts the toggles below it. */
function lookDescription(s: Settings): string {
  if (s.doppler && s.gravity) return "Doppler beaming and gravitational redshift on, as relativity predicts.";
  if (!s.doppler && !s.gravity && s.look === "interstellar") return "As in Interstellar: no Doppler or redshift colour shifts, warmer disk.";
  return `Custom: Doppler beaming ${s.doppler ? "on" : "off"}, gravitational redshift ${s.gravity ? "on" : "off"}.`;
}

const field = <T = HTMLInputElement>(name: string) => form.elements.namedItem(name) as unknown as T;
const outputs = {
  temp: field<HTMLOutputElement>("o-temp"),
  outer: field<HTMLOutputElement>("o-outer"),
  exposure: field<HTMLOutputElement>("o-exp"),
  bloom: field<HTMLOutputElement>("o-bloom"),
  sky: field<HTMLOutputElement>("o-sky"),
};

function writeForm(): void {
  field<RadioNodeList>("look").value = settings.look;
  field<RadioNodeList>("quality").value = settings.quality;
  for (const k of ["auto", "doppler", "gravity", "cruise", "milkyWay"] as const) field(k).checked = settings[k];
  for (const k of ["temp", "outer", "exposure", "bloom", "sky"] as const) field(k).value = String(settings[k]);
  outputs.temp.textContent = `${settings.temp} K`;
  outputs.outer.innerHTML = `${settings.outer} r<sub>s</sub>`;
  outputs.exposure.textContent = settings.exposure.toFixed(2);
  outputs.bloom.textContent = settings.bloom.toFixed(2);
  outputs.sky.textContent = `${settings.sky.toFixed(1)}×`;
  lookHelp.textContent = lookDescription(settings);
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
let milkyWayLoaded = false;

function showFallback(msg?: string): void {
  const fb = document.querySelector<HTMLElement>("#fallback")!;
  fb.hidden = false;
  if (msg) document.querySelector("#fallback-msg")!.textContent = msg;
  canvas.hidden = true;
  document.querySelector<HTMLElement>("#stats")!.hidden = true;
  document.querySelector<HTMLElement>("#hint")!.hidden = true;
  document.querySelector<HTMLElement>(".hud--tools")!.hidden = true;
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
      mobile: coarsePointer,
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
  const mw = new Image();
  mw.src = new URL("data/milkyway.jpg", document.baseURI).href;
  mw.decode()
    .then(() => {
      renderer?.setMilkyWay(mw);
      milkyWayLoaded = true;
    })
    .catch((err) => console.warn("milky way:", err));
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    showFallback("The graphics context was lost. Reload the page to restart the render.");
    renderer = null;
  });
}

// ---- input ----
// The render fills the first screen, so it must not trap page scrolling ("cooperative gestures"):
// - mouse: drag orbits; plain wheel scrolls the page; Ctrl/⌘ + wheel zooms, and so does trackpad
//   pinch (ctrl+wheel in Chromium and Firefox, gesture events in Safari).
// - touch and pen (CSS touch-action: pan-y): a vertical swipe scrolls the page, a sideways drag
//   orbits; two fingers tilt (move together) and zoom (pinch), with page scrolling suppressed.
const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);
if (coarsePointer) document.querySelector("#hint")!.textContent = "Swipe sideways to orbit · two fingers to tilt and zoom";
const toast = document.querySelector<HTMLElement>("#toast")!;
function showToast(text: string): void {
  if (!toast.hidden) return; // one announcement per burst of wheel events, not one per tick
  toast.textContent = text;
  toast.hidden = false;
  window.setTimeout(() => (toast.hidden = true), 1800);
}

const pointers = new Map<number, { x: number; y: number; touch: boolean }>();
let lastPinch = 0;
let lastMid: { x: number; y: number } | null = null;
let lastMove = performance.now();
canvas.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, touch: e.pointerType !== "mouse" });
  lastPinch = 0;
  lastMid = null;
});
canvas.addEventListener("pointermove", (e) => {
  const prev = pointers.get(e.pointerId);
  if (!prev) return;
  const now = performance.now();
  const s = 3.2 / Math.max(canvas.clientHeight, 1);
  if (pointers.size === 1) {
    // One finger or pen only orbits sideways; its vertical motion belongs to page scrolling.
    const dy = prev.touch ? 0 : (e.clientY - prev.y) * s;
    cam.rotate(-(e.clientX - prev.x) * s, dy, now - lastMove);
  }
  pointers.set(e.pointerId, { ...prev, x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (lastPinch) cam.zoom(lastPinch / d);
    if (lastMid) cam.turn(-(mid.x - lastMid.x) * s, (mid.y - lastMid.y) * s);
    lastPinch = d;
    lastMid = mid;
  }
  lastMove = now;
});
const endPointer = (e: PointerEvent) => {
  pointers.delete(e.pointerId);
  lastPinch = 0;
  lastMid = null;
};
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);
// pan-y would let a two-finger vertical move scroll the page and cancel the tilt; claim
// multi-touch moves for the camera instead.
canvas.addEventListener("touchmove", (e) => {
  if (e.touches.length > 1) e.preventDefault();
}, { passive: false });
// Safari reports trackpad pinch as non-standard gesture events rather than ctrl+wheel.
let gestureScale = 1;
canvas.addEventListener("gesturestart", (e) => {
  e.preventDefault();
  gestureScale = 1;
});
canvas.addEventListener("gesturechange", (e) => {
  e.preventDefault();
  const scale = (e as Event & { scale: number }).scale;
  cam.zoom(gestureScale / scale);
  gestureScale = scale;
});
canvas.addEventListener("wheel", (e) => {
  if (!e.ctrlKey && !e.metaKey) {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) showToast(`Hold ${isMac ? "⌘" : "Ctrl"} and scroll to zoom`);
    return; // let the page scroll
  }
  e.preventDefault();
  const px = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1); // lines / pages -> pixels
  cam.zoom(Math.exp(Math.sign(px) * Math.min(Math.abs(px), 200) * 0.0015));
}, { passive: false });

// On-screen zoom for anyone without a wheel, trackpad pinch or keyboard.
// A velocity of ln(f) * 3.5 integrates to a factor of f under the camera's damping.
for (const [id, f] of [["#zoom-in", 1 / 1.3], ["#zoom-out", 1.3]] as const) {
  document.querySelector(id)!.addEventListener("click", () => (reducedMotion ? cam.zoom(f) : cam.zoomVelocity(Math.log(f) * 3.5)));
}

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
document.querySelector("#reset-settings")!.addEventListener("click", () => {
  // Keep the quality that suits this device, and the reduced-motion rule for cruise.
  Object.assign(settings, DEFAULTS, { quality: settings.quality, cruise: DEFAULTS.cruise && !reducedMotion });
  writeForm();
  saveSettings(settings);
  showToast("Settings reset");
});

// ---- framing, full screen, hide interface ----
// When the panel sits beside the render, shift the principal point so the hole is centred in the
// space left free, and centre the bottom hint/cue there too.
const stage = document.querySelector<HTMLElement>(".stage")!;
const sideLayout = matchMedia("(min-width: 721px)");
let shiftX = 0, targetShiftX = 0;
function updateFraming(): void {
  const cr = canvas.getBoundingClientRect();
  let freeRight = 0;
  if (panel.open && sideLayout.matches && !stage.classList.contains("ui-hidden") && cr.width > 0) {
    const pr = panel.getBoundingClientRect();
    freeRight = Math.max(0, cr.right - pr.left);
  }
  stage.style.setProperty("--free-right", `${freeRight}px`);
  targetShiftX = cr.width > 0 ? Math.max(-0.45, -freeRight / cr.width) : 0;
  if (reducedMotion) shiftX = targetShiftX;
}
panel.addEventListener("toggle", updateFraming);
window.addEventListener("resize", updateFraming);
sideLayout.addEventListener("change", updateFraming);
updateFraming();

const hideBtn = document.querySelector<HTMLButtonElement>("#hide-ui")!;
const showBtn = document.querySelector<HTMLButtonElement>("#show-ui")!;
function setUiHidden(hidden: boolean): void {
  stage.classList.toggle("ui-hidden", hidden);
  updateFraming();
  // Keep focus where it was (e.g. on the canvas, so the arrow keys keep orbiting) unless it was on
  // the button that just disappeared.
  const a = document.activeElement;
  if (a === hideBtn || a === showBtn || (hidden && a && stage.contains(a) && a !== canvas)) {
    (hidden ? showBtn : hideBtn).focus({ preventScroll: true });
  }
}
hideBtn.addEventListener("click", () => setUiHidden(true));
showBtn.addEventListener("click", () => setUiHidden(false));

const fsBtn = document.querySelector<HTMLButtonElement>("#fullscreen")!;
fsBtn.hidden = !document.fullscreenEnabled; // e.g. iPhone Safari has no element full screen
function toggleFullscreen(): void {
  if (!document.fullscreenEnabled) return;
  if (document.fullscreenElement) void document.exitFullscreen();
  else void stage.requestFullscreen().catch(() => showToast("Full screen was blocked"));
}
fsBtn.addEventListener("click", toggleFullscreen);
document.addEventListener("fullscreenchange", () => {
  fsBtn.setAttribute("aria-pressed", String(!!document.fullscreenElement));
  // Esc in full screen goes to the browser, so leaving full screen also brings the interface back.
  if (!document.fullscreenElement && stage.classList.contains("ui-hidden")) setUiHidden(false);
  else updateFraming();
});

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || document.body.dataset.render === "fallback") return;
  const t = e.target as HTMLElement;
  if (e.code === "Escape" && stage.classList.contains("ui-hidden")) return setUiHidden(false);
  if (t.closest("input, textarea, select, [contenteditable]")) return;
  if (e.code === "KeyH") setUiHidden(!stage.classList.contains("ui-hidden"));
  else if (e.code === "KeyF") toggleFullscreen();
});

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
    shift: [shiftX, 0],
    time: simTime,
    tempPeak: settings.temp,
    diskOuter: settings.outer,
    doppler: settings.doppler,
    gravity: settings.gravity,
    bloom: settings.bloom,
    exposure: settings.exposure,
    starGain: 6 * settings.sky,
    milkyWay: settings.milkyWay,
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
  shiftX += (targetShiftX - shiftX) * Math.min(1, dt * 6);
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
  const px = renderer.readPixels({ ...params(), shift: [0, 0] }); // the saved image is centred, panel or not
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
    __bh?: { ready: () => boolean; milkyWay: () => boolean; radius: () => number; setCamera: (c: Partial<Pick<OrbitCamera, "radius" | "azimuth" | "elevation">>) => void; sample: () => { w: number; h: number; mean: number; nonBlack: number; info: ReturnType<Renderer["info"]> } | null };
  }
}
window.__bh = {
  ready: () => !!renderer,
  milkyWay: () => milkyWayLoaded,
  radius: () => cam.radius,
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
