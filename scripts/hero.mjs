// Renders clean frames (no HUD) for the no-WebGL fallback, the social card and the README.
// Usage: node scripts/hero.mjs <url> ; set PW_CHROMIUM to use a preinstalled Chromium.
import { chromium } from "@playwright/test";

const url = process.argv[2] ?? "http://127.0.0.1:4173/";
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const frames = [
  { file: "public/fallback.jpg", w: 1280, h: 720, settings: {} },
  { file: "public/og.jpg", w: 1200, h: 630, settings: {} },
  { file: "docs/img/physical.jpg", w: 1280, h: 720, settings: {} },
  { file: "docs/img/film.jpg", w: 1280, h: 720, settings: { look: "interstellar", doppler: false, gravity: false, temp: 4300, exposure: 0.6, bloom: 0.8 } },
  { file: "docs/img/close.jpg", w: 1280, h: 720, settings: { exposure: 0.3 }, camera: { radius: 7, elevation: 0.32, azimuth: 0.6 } },
  { file: "docs/img/mobile.jpg", w: 390, h: 844, settings: {}, hud: true },
];
for (const f of frames) {
  const page = await browser.newPage({ viewport: { width: f.w, height: f.h } });
  await page.addInitScript((s) => {
    localStorage.setItem("bh-settings", JSON.stringify({ quality: "ultra", auto: false, cruise: false, ...s }));
  }, f.settings);
  await page.goto(url);
  await page.waitForFunction(() => window.__bh?.ready());
  if (!f.hud) await page.addStyleTag({ content: ".hud, .panel { display: none !important; }" });
  if (f.camera) await page.evaluate((c) => window.__bh.setCamera(c), f.camera);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: f.file, type: "jpeg", quality: 86 });
  await page.close();
  console.log(f.file);
}
await browser.close();
