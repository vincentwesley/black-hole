import { expect, test, type Page } from "@playwright/test";

// Educational overlay (renderer.setOverlay), with cruise on as by default.
async function open(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("bh-settings", JSON.stringify({ quality: "low", auto: false, cruise: true }));
  });
  await page.goto("/");
  await page.waitForFunction(() => window.__bh?.ready());
}

test("overlay draws its rings and labels only when enabled", async ({ page }) => {
  await open(page);
  const on = await page.evaluate(() => {
    const bh = window.__bh!;
    const count = () => {
      const px = bh.read()!;
      let mint = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i + 1] > 150 && px[i + 1] > px[i] + 60 && px[i + 1] > px[i + 2] + 30) mint++;
      return mint;
    };
    const before = count();
    bh.setOverlay(true);
    const after = count();
    bh.setOverlay(false);
    return { before, after, again: count() };
  });
  expect(on.after).toBeGreaterThan(on.before + 50);
  expect(on.again).toBeLessThanOrEqual(on.before + 5);
});
