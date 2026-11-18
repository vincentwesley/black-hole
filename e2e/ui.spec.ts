import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Same quick settings as app.spec: low preset, no cruise, no governor.
async function open(page: Page, path = "/?e2e") {
  await page.addInitScript(() => {
    if (!localStorage.getItem("bh-settings")) localStorage.setItem("bh-settings", JSON.stringify({ quality: "low", auto: false, cruise: false }));
  });
  await page.goto(path);
  await page.waitForFunction(() => window.__bh?.ready());
}
const openPanel = async (page: Page) => {
  const panel = page.locator("#panel");
  if (!(await panel.evaluate((d: HTMLDetailsElement) => d.open))) await panel.locator(":scope > summary").click();
};

test("the first paint is the final layout (no layout shift on desktop)", async ({ page, viewport }) => {
  test.skip(viewport!.width < 1100, "desktop layout only");
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number };
    w.__cls = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) w.__cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  await open(page);
  await page.waitForTimeout(1500);
  await expect(page.locator("#panel")).toHaveJSProperty("open", true);
  expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThan(0.02);
});

test("tap targets are at least 48px", async ({ page }) => {
  await open(page);
  await openPanel(page);
  await page.locator("details.sub > summary").click();
  const small = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("a[href], button, input, summary, .tog, .seg label")) {
      if (el.matches(".skip, .brand, .seg input, .tog input, .check input, .creator__links *") || el.closest(".logo-pick")) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === "hidden") continue;
      if (r.height < 47.5 || r.width < 47.5) out.push(`${el.tagName}.${el.className} "${(el.textContent || "").trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return out;
  });
  expect(small).toEqual([]);
});

test("presets glide to a new view", async ({ page }) => {
  await open(page);
  await openPanel(page);
  await page.getByRole("button", { name: /Close pass/ }).click();
  await expect.poll(() => page.evaluate(() => window.__bh!.radius()), { timeout: 5000 }).toBeCloseTo(7, 1);
  await page.getByRole("button", { name: "Face-on" }).click();
  await expect.poll(() => page.evaluate(() => window.__bh!.radius()), { timeout: 5000 }).toBeCloseTo(14, 1);
});

test("a preset is instant when reduced motion is on", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  await openPanel(page);
  await page.getByRole("button", { name: "Photon ring" }).click();
  expect(await page.evaluate(() => window.__bh!.radius())).toBeCloseTo(6, 1);
});

test("Copy link round-trips the view and settings", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => undefined);
  await open(page);
  await openPanel(page);
  await page.evaluate(() => window.__bh!.setCamera({ radius: 9.5, azimuth: 1.25, elevation: 0.4 }));
  await page.getByLabel("Show radii").check();
  await page.getByRole("button", { name: "Copy link" }).click();
  // Without clipboard access the app leaves the link in the address bar instead.
  const url = await page
    .evaluate(() => navigator.clipboard.readText())
    .catch(() => "")
    .then((t) => t || page.url());
  expect(url).toContain("#");
  const hash = url.slice(url.indexOf("#"));
  const page2 = await context.newPage();
  await open(page2, `/?e2e${hash}`);
  expect(await page2.evaluate(() => window.__bh!.radius())).toBeCloseTo(9.5, 1);
  await openPanel(page2);
  await expect(page2.locator("input[name=overlay]")).toBeChecked({ timeout: 45_000 }); // slow software GL
  expect(page2.url()).toContain("#"); // the URL is not rewritten
});

test("an invalid share link falls back to defaults", async ({ page }) => {
  await open(page, "/?e2e#r=junk&el=9&q=nope&temp=zzz");
  expect(await page.evaluate(() => window.__bh!.radius())).toBe(18);
});

test("__bh is not exposed without ?e2e", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => "__bh" in window)).toBe(false);
});

test("no WebGL2: still frame with a caption, no controls, and the still is fetched only then", async ({ page }) => {
  const stills: string[] = [];
  page.on("request", (r) => r.url().includes("fallback.jpg") && stills.push(r.url()));
  await page.goto("/?e2e");
  await page.waitForFunction(() => window.__bh?.ready());
  await page.waitForTimeout(500);
  expect(stills).toEqual([]);

  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return type === "webgl2" ? null : (orig as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof orig;
  });
  await page.goto("/");
  await expect(page.locator("#fallback")).toBeVisible();
  await expect(page.locator("#panel")).toBeHidden();
  await expect(page.locator("#fallback-msg")).toBeVisible();
  await expect.poll(() => stills.length).toBeGreaterThan(0);
  const [img, msg] = await Promise.all([page.locator("#fallback img").boundingBox(), page.locator("#fallback-msg").boundingBox()]);
  expect(msg!.y).toBeGreaterThanOrEqual(img!.y + img!.height - 1); // caption sits below the image, not over it
});

test("the canvas is a labelled, keyboard-described application", async ({ page }) => {
  await open(page);
  const c = page.locator("#view");
  await expect(c).toHaveAttribute("role", "application");
  await expect(c).toHaveAttribute("aria-describedby", "keylist");
  await expect(page.locator("#zoom-live")).toHaveAttribute("aria-live", "polite");
});

test("tablet width: the hint does not overlap the toolbar or the cue", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await open(page);
  type Box = { x: number; y: number; width: number; height: number };
  const [hint, tools, cue] = (await Promise.all(["#hint", ".hud--tools", ".scroll-cue"].map((s) => page.locator(s).boundingBox()))) as Box[];
  const hit = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  expect(hit(hint, tools)).toBe(false);
  expect(hit(cue, tools)).toBe(false);
});

for (const theme of ["dark", "light"] as const) {
  test(`axe clean with the panel open (${theme})`, async ({ page }) => {
    await open(page);
    await openPanel(page);
    if (theme === "light") await page.getByRole("button", { name: "Light theme" }).click();
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });
}
