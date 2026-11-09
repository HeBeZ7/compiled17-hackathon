import { expect, test } from "@playwright/test";
import { expectCleanCopy, expectNoSideScroll, id, openCatalogList, paths, stubCatalog } from "./support/app";
import { CATALOG_DOUBLE_MODEL } from "./support/fixtures";

test.describe.configure({ timeout: 60_000 });

// R-025 and R-028. Runs without the classroom hook, so it does not need AA_QA_E2E.
const HEADLINE = ["Your model", "Your character", "Your kind of AI"];

test.describe("landing", () => {
  test("L1 the landing headline, wordmark, navigation and CTAs are real accessible elements", async ({ page }) => {
    await page.goto(paths.landing);
    const headline = page.getByRole("heading", { level: 1 });
    for (const line of HEADLINE) await expect(headline).toContainText(line);
    await expect(page.getByRole("link", { name: "Agent Academy" })).toBeVisible();
    // The landing header drops its secondary links below 720 px and keeps Enter Academy. See O-12 in the plan.
    if (page.viewportSize()!.width > 720) await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Meet your agent" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Enter Academy" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Explore the classroom" })).toBeVisible();
    await expectNoSideScroll(page);
  });

  test("L2 each landing CTA goes to its real destination", async ({ page }) => {
    for (const [name, url] of [["Meet your agent", /\/create$/], ["Enter Academy", /\/create$/], ["Explore the classroom", /\/classroom$/]] as const) {
      await page.goto(paths.landing);
      await page.getByRole("link", { name }).click();
      await expect(page, name).toHaveURL(url, { timeout: 30_000 });
    }
  });

  test("K1 the landing page has English copy with no sentence periods", async ({ page }) => {
    await page.goto(paths.landing);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectCleanCopy(page);
  });
});

test.describe("onboarding copy", () => {
  test("K2 the DOM catalog has English copy with no sentence periods", async ({ page }) => {
    await stubCatalog(page);
    await openCatalogList(page, CATALOG_DOUBLE_MODEL);
    await expectCleanCopy(page);
  });

  test("K3 the character screen has English copy with no sentence periods", async ({ page }) => {
    await stubCatalog(page);
    await openCatalogList(page, CATALOG_DOUBLE_MODEL);
    await page.locator(id(`model-option-${CATALOG_DOUBLE_MODEL}`)).click();
    await page.getByRole("button", { name: "Next: name and appearance" }).click();
    await expect(page.locator(id("agent-name"))).toBeVisible();
    await expectCleanCopy(page);
  });
});
