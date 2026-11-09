import { expect, test } from "@playwright/test";
import { classroomRoot, closeTeacher, expectCleanCopy, id, learningDialog, myAgentPill, paths, seedAgent, stubCatalog, teacherDialog } from "./support/app";
import { disableWebGL } from "./support/browser-doubles";
import { CATALOG_DOUBLE_MODEL } from "./support/fixtures";

test.describe.configure({ timeout: 60_000 });

// WebGL refused through getContext: the page must still be usable without the 3D view.
test.describe("[WebGL refused] fallback", () => {
  test.beforeEach(async ({ page }) => { await disableWebGL(page); });

  test("F1 the classroom falls back and the teacher and learning station still open", async ({ page }) => {
    await seedAgent(page);
    await page.goto(paths.classroom);
    const fallback = page.locator(id("classroom-fallback"));
    await expect(fallback).toBeVisible({ timeout: 45_000 });
    await expect(classroomRoot(page).locator("canvas")).toHaveCount(0);
    await expect(myAgentPill(page)).toContainText("Test student");
    await expectCleanCopy(page);

    await fallback.getByRole("button", { name: "Talk to your teacher" }).click();
    await expect(teacherDialog(page)).toBeVisible();
    await closeTeacher(page);
    await fallback.getByRole("button", { name: "Open learning station" }).click();
    await expect(learningDialog(page)).toBeVisible();
  });

  test("F2 the landing page still works and its CTA reaches the DOM catalog", async ({ page }) => {
    await stubCatalog(page);
    await page.goto(paths.landing);
    await page.getByRole("link", { name: "Meet your agent" }).click();
    await expect(page).toHaveURL(/\/create$/, { timeout: 30_000 });
    await expect(page.locator(id(`model-option-${CATALOG_DOUBLE_MODEL}`))).toBeVisible();
    await expect(page.getByRole("button", { name: "List view" })).toHaveCount(0);
  });
});
