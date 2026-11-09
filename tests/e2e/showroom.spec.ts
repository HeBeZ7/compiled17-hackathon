import { expect, test, type Page } from "@playwright/test";
import { api, currentAgent, id, paths } from "./support/app";
import { FAMILY_MODELS, OTHER_FAMILY_MODEL, familyCatalogPage, ok } from "./support/fixtures";

test.skip(!process.env.AA_QA_E2E, "Not run without the product hook. Run with AA_QA_E2E=1 against the target commit.");
test.describe.configure({ timeout: 60_000 });

// A-16, R-026. The catalog is a double with invented identifiers, so these specs prove showroom behaviour and that
// the exact model is what is saved. Real catalog identifiers need a run against the live catalog, which is not here.
const [SEVEN_B, THIRTEEN_B] = FAMILY_MODELS;

const stubFamilyCatalog = (page: Page) =>
  page.route(api.catalogSearch, (route) => {
    const query = new URL(route.request().url()).searchParams.get("query") ?? "";
    return route.fulfill({ json: ok(familyCatalogPage(query)) });
  });

const panel = (page: Page) => page.locator(id("showroom-panel"));

async function openShowroom(page: Page) {
  await stubFamilyCatalog(page);
  await page.goto(paths.onboarding);
  await expect(page.locator(id("model-showroom"))).toBeVisible({ timeout: 45_000 });
  await expect(page.locator(id("showroom-model-id"))).toBeVisible({ timeout: 45_000 });
}

test.describe("[catalog double] model showroom", () => {
  test("S1 the exact model and revision are shown and the exact model is what gets saved", async ({ page }) => {
    await openShowroom(page);
    await expect(page.locator(id("showroom-model-id"))).toHaveText(SEVEN_B.modelId);
    await expect(page.locator(id("showroom-model-revision"))).toHaveText(SEVEN_B.revision.slice(0, 12));
    await page.locator(id("showroom-model-select")).selectOption({ label: THIRTEEN_B.modelId });
    await expect(page.locator(id("showroom-model-id"))).toHaveText(THIRTEEN_B.modelId);
    await expect(page.locator(id("showroom-model-revision"))).toHaveText("Unverified");
    await expect(page.locator(id("showroom-chosen"))).toHaveCount(0);

    await page.locator(id("showroom-choose")).click();
    await expect(page.locator(id("showroom-chosen"))).toBeVisible();
    await page.locator(id("showroom-continue")).click();
    await page.locator(id("agent-name")).fill("Test student");
    await page.locator(id("avatar-mode-drawing")).click();
    const canvas = page.locator(id("avatar-draw-canvas"));
    const b = (await canvas.boundingBox())!;
    await page.mouse.move(b.x + 20, b.y + 20);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width - 20, b.y + b.height - 20, { steps: 5 });
    await page.mouse.up();
    await expect(page.locator(id("avatar-preview"))).toHaveAttribute("data-selection", "draft");
    await page.locator(id("onboarding-confirm")).click();
    await page.waitForURL(`**${paths.classroom}`);

    const agent = await currentAgent(page);
    expect(agent?.selectedModel?.modelId).toBe(THIRTEEN_B.modelId);
    expect(agent?.selectedModel?.revision).toBeNull();
  });

  test("S2 List view shows every catalog entry, including other families", async ({ page }) => {
    await openShowroom(page);
    await page.getByRole("button", { name: "List view" }).click();
    for (const modelId of [SEVEN_B.modelId, THIRTEEN_B.modelId, OTHER_FAMILY_MODEL]) {
      await expect(page.locator(id(`model-option-${modelId}`))).toBeVisible();
    }
  });

  test("S3 search from the showroom reaches matching results in the list", async ({ page }) => {
    await openShowroom(page);
    const box = page.locator(id("model-showroom")).getByRole("searchbox");
    await box.fill("otherfam");
    await box.press("Enter");
    await expect(page.locator(id(`model-option-${OTHER_FAMILY_MODEL}`))).toBeVisible();
    await expect(page.locator(id(`model-option-${SEVEN_B.modelId}`))).toHaveCount(0);
  });

  test("S4 the details panel invents no scores, prices or support claims", async ({ page }) => {
    await openShowroom(page);
    await expect(panel(page)).not.toContainText(/score|benchmark|\$\s*\d|\bUSD\b|\bprice\b|trainable|fully supported/i);
  });
});
