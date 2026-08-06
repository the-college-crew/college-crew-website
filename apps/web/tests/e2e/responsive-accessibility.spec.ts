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

test("Help offers public handoff paths and gates AI behind sign-in", async ({ page }) => {
  await page.goto("/browse");
  const launcher = page.getByRole("button", { name: "Help", exact: true });
  await launcher.click();

  await expect(page.getByRole("button", { name: /Ask the College Crew AI/ })).toBeVisible();
  const ticket = page.getByRole("link", { name: /Submit a ticket/ });
  await expect(ticket).toHaveAttribute("href", "/support?from=%2Fbrowse");

  const email = page.getByRole("link", { name: /Email support/ });
  const mailto = await email.getAttribute("href");
  expect(mailto).toContain("mailto:support@thecollegecrew.com");
  expect(mailto).toContain("College%20Crew%20support");
  expect(decodeURIComponent(mailto || "")).toContain("http://127.0.0.1:3100/browse");

  await page.getByRole("button", { name: /Ask the College Crew AI/ }).click();
  await expect(page.getByText(/Please sign in before speaking with the AI assistant/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login?next=%2Fbrowse");

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(launcher).toBeFocused();
});
