// Headless screenshots of the running app.
// Usage: node scripts/screenshots.mjs <url> <outDir> [settings JSON] [shot name filter]
// Set PW_CHROMIUM to a Chromium binary when Playwright's bundled browser is not installed.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const [url = "http://127.0.0.1:4173/", out = "qa-output", settings = "", only = ""] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const shots = [
  { name: "desktop-dark", viewport: { width: 1280, height: 720 }, theme: "dark" },
  { name: "desktop-light", viewport: { width: 1280, height: 720 }, theme: "light" },
  { name: "mobile-dark", viewport: { width: 375, height: 812 }, theme: "dark" },
  { name: "mobile-light", viewport: { width: 375, height: 812 }, theme: "light" },
];
for (const s of shots.filter((x) => x.name.includes(only))) {
  const page = await browser.newPage({ viewport: s.viewport });
  page.on("console", (m) => m.type() !== "log" && console.log(`[${s.name}] ${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => console.log(`[${s.name}] pageerror: ${e.message}`));
  await page.addInitScript(([theme, json]) => {
    localStorage.setItem("theme", theme);
    if (json) localStorage.setItem("bh-settings", json);
  }, [s.theme, settings]);
  await page.goto(url);
  await page.waitForFunction(() => window.__bh?.ready());
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${s.name}.png` });
  await page.screenshot({ path: `${out}/${s.name}-full.png`, fullPage: true });
  await page.close();
}
await browser.close();
console.log(`screenshots -> ${out}/`);
