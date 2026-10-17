import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Keep e2e fast on software GL: low preset, no cruise, no governor.
async function open(page: Page, settings: Record<string, unknown> = {}) {
  await page.addInitScript((s) => {
    localStorage.setItem("bh-settings", JSON.stringify({ quality: "low", auto: false, cruise: false, ...s }));
  }, settings);
  await page.goto("/");
}

const sample = (page: Page) => page.evaluate(() => window.__bh!.sample()!);

test("renders the black hole with WebGL2 and dark theme by default", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.waitForFunction(() => window.__bh?.ready());
  const s = await sample(page);
  expect(s.w).toBeGreaterThan(0);
  // The frame holds both the bright disk and the dark shadow/sky.
  expect(s.mean).toBeGreaterThan(8);
  expect(s.nonBlack).toBeGreaterThan(0.05);
  expect(s.nonBlack).toBeLessThan(0.9);
  expect(errors).toEqual([]);
  await expect(page.getByText("Made by")).toBeAttached();
});

test("Doppler toggle and Film look change the frame", async ({ page }) => {
  await open(page);
  await page.waitForFunction(() => window.__bh?.ready());
  const panel = page.locator("#panel");
  if (!(await panel.evaluate((d: HTMLDetailsElement) => d.open))) await panel.locator("summary").click();
  const before = await sample(page);
  await page.getByLabel("Doppler beaming").uncheck();
  const after = await sample(page);
  expect(Math.abs(after.mean - before.mean)).toBeGreaterThan(0.5);
  await page.getByRole("radio", { name: "Film" }).check();
  await expect(page.getByLabel("Gravitational redshift")).not.toBeChecked();
});

test("Milky Way map loads and adds light to the sky", async ({ page }) => {
  await open(page, { sky: 5 });
  await page.waitForFunction(() => window.__bh?.ready() && window.__bh.milkyWay());
  const panel = page.locator("#panel");
  if (!(await panel.evaluate((d: HTMLDetailsElement) => d.open))) await panel.locator("summary").click();
  const withMw = await sample(page);
  await page.getByLabel("Milky Way").uncheck();
  const without = await sample(page);
  expect(withMw.mean).toBeGreaterThan(without.mean + 0.3);
});

test("zoom keys move the camera and the readout follows", async ({ page }) => {
  await open(page);
  await page.waitForFunction(() => window.__bh?.ready());
  await page.locator("#view").focus();
  await page.keyboard.down("-");
  await page.waitForTimeout(800);
  await page.keyboard.up("-");
  await expect(page.locator("#s-r")).not.toHaveText("18.0");
});

test("theme toggle switches the page chrome to light", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("falls back to a still frame without WebGL2", async ({ page }) => {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return type === "webgl2" ? null : (orig as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof orig;
  });
  await page.goto("/");
  await expect(page.locator("#fallback")).toBeVisible();
  await expect(page.locator("#view")).toBeHidden();
});

for (const theme of ["dark", "light"] as const) {
  test(`axe clean (${theme})`, async ({ page }) => {
    await open(page);
    if (theme === "light") await page.getByRole("button", { name: "Light theme" }).click();
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });
}
