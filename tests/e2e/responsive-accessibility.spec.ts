import { expect, test } from "@playwright/test";

test("public hourly entry points retain responsive landmarks and labels", async ({
  page,
}) => {
  for (const path of ["/", "/browse"]) {
    await page.goto(path);

    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.locator("h1").first()).toBeVisible();

    const unlabeledControls = await page.locator("button").evaluateAll((buttons) =>
      buttons.filter(
        (button) =>
          !button.getAttribute("aria-label") && !button.textContent?.trim(),
      ).length,
    );
    expect(unlabeledControls).toBe(0);

    const overflowsViewport = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflowsViewport).toBe(false);
  }
});
