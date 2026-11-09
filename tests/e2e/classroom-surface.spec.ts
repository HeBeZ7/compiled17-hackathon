import { expect, test, type Page } from "@playwright/test";
import { INTERACTIONS, TEACHER } from "../../src/shared/world/layout";
import {
  STATION_SPOT,
  TEACHER_SPOT,
  TEACHER_TOO_FAR,
  classroomRoot,
  closeTeacher,
  enterClassroom,
  expectCleanCopy,
  expectNoOverlap,
  expectNoSideScroll,
  expectOnTop,
  id,
  INTERACT_KEY,
  interactPrompt,
  learningDialog,
  lookPrompt,
  myAgentPill,
  openCharacterCard,
  openTeacher,
  paths,
  pause,
  place,
  seedAgent,
  snap,
  stubCatalog,
  teacherDialog,
  walkUntil,
} from "./support/app";

test.skip(!process.env.AA_QA_E2E, "Not run without the product hook. Run with AA_QA_E2E=1 against the target commit.");
test.describe.configure({ timeout: 60_000 });

const station = /Open learning station/;

const offsetFromTeacher = (angle: number, dist: number) => ({ x: TEACHER.x, z: TEACHER.z + dist, yaw: angle });

async function expectNothingOpens(page: Page) {
  await page.keyboard.press(INTERACT_KEY);
  await pause(page, 300);
  await expect(teacherDialog(page)).toBeHidden();
  await expect(learningDialog(page)).toBeHidden();
}

test.describe("teacher and learning station interaction", () => {
  test.beforeEach(async ({ page }) => { await enterClassroom(page); });

  test("R1 the prompt appears only in reach and aim and clicking it opens the real dialog", async ({ page }) => {
    await expect(interactPrompt(page)).toBeHidden();

    await place(page, TEACHER_SPOT);
    await expect(interactPrompt(page)).toHaveText("[E] Talk to your teacher");
    await expect(classroomRoot(page)).toHaveAttribute("data-near", "teacher");

    await interactPrompt(page).click();
    await expect(teacherDialog(page)).toBeVisible();
    await expect(interactPrompt(page)).toBeHidden();
    expect((await snap(page)).paused).toBe(true);
    await closeTeacher(page);

    await place(page, TEACHER_TOO_FAR);
    await expect(interactPrompt(page)).toBeHidden();
    await expect(classroomRoot(page)).toHaveAttribute("data-near", "");
  });

  test("R2 the learning station prompt opens the real learning dialog", async ({ page }) => {
    await place(page, STATION_SPOT);
    await expect(interactPrompt(page)).toHaveText("[E] Open learning station");
    await page.getByRole("button", { name: station }).click();
    await expect(learningDialog(page)).toBeVisible();
  });

  test("R3 E opens nothing when no target is in reach and aim", async ({ page }) => {
    await place(page, TEACHER_TOO_FAR);
    await expectNothingOpens(page);
  });

  test("R5 the teacher needs both reach and aim, and each limit is enforced", async ({ page }) => {
    const { reach, aim } = INTERACTIONS.teacher;

    await place(page, offsetFromTeacher(0, reach - 0.1));
    expect((await snap(page)).target, "just inside reach").toBe("teacher");

    await place(page, offsetFromTeacher(0, reach + 0.1));
    expect((await snap(page)).target, "just outside reach").toBeNull();
    await expectNothingOpens(page);

    await place(page, offsetFromTeacher(aim - 0.08, 1.5));
    expect((await snap(page)).target, "just inside aim").toBe("teacher");

    await place(page, offsetFromTeacher(aim + 0.08, 1.5));
    expect((await snap(page)).target, "just outside aim").toBeNull();
    await expectNothingOpens(page);

    await place(page, offsetFromTeacher(Math.PI, 1.5));
    expect((await snap(page)).target, "back turned").toBeNull();
    await expectNothingOpens(page);

    await place(page, offsetFromTeacher(0, 1.5), 1.2);
    expect((await snap(page)).target, "looking at the ceiling").toBeNull();
    await expectNothingOpens(page);
  });

  test("R6 the prompt disappears as soon as the player turns away", async ({ page }) => {
    await place(page, TEACHER_SPOT);
    await expect(interactPrompt(page)).toBeVisible();
    await page.evaluate(() => window.__AA_TEST__!.classroom!.setLook(Math.PI, 0));
    await expect(interactPrompt(page)).toBeHidden();
  });

  test("R7 the teacher can be reached on foot from the spawn point", async ({ page }) => {
    await walkUntil(page, "KeyW", (p) => p.z <= -2.2);
    const { position } = await snap(page);
    const yaw = Math.atan2(-(TEACHER.x - position.x), -(TEACHER.z - position.z));
    await page.evaluate((y) => window.__AA_TEST__!.classroom!.setLook(y, 0), yaw);
    expect((await snap(page)).target).toBe("teacher");
    await page.keyboard.press(INTERACT_KEY);
    await expect(teacherDialog(page)).toBeVisible();
  });

  test("R8 the learning station can be reached on foot from the spawn point", async ({ page }) => {
    await walkUntil(page, "KeyW", (p) => p.z <= STATION_SPOT.z);
    await page.evaluate(() => window.__AA_TEST__!.classroom!.setLook(-Math.PI / 2, 0));
    await walkUntil(page, "KeyW", (p) => p.x >= 2.9);
    expect((await snap(page)).target).toBe("study_spot");
    await page.keyboard.press(INTERACT_KEY);
    await expect(learningDialog(page)).toBeVisible();
  });
});

test.describe("HUD and dialog layout", () => {
  test("N1 the HUD fits the screen and its controls do not overlap", async ({ page }) => {
    await enterClassroom(page);
    await place(page, TEACHER_SPOT);
    await expect(myAgentPill(page)).toContainText("My agent");
    await expect(page.getByText("Classroom 01")).toBeVisible();
    await expectNoOverlap(page, {
      "My agent pill": myAgentPill(page),
      "room label": page.getByText("Classroom 01"),
      "quality buttons": page.locator(id("classroom-quality")),
      "look prompt": lookPrompt(page),
      "interact prompt": interactPrompt(page),
      "control hint": page.locator(id("classroom-hint")),
      "My character button": page.locator(id("classroom-character-toggle")),
    });
    await expectOnTop(interactPrompt(page), "interact prompt");
    await expectOnTop(page.locator(id("classroom-character-toggle")), "My character button");
    await expectNoSideScroll(page);
  });

  test("N2 the teacher dialog's input and Close are reachable and it fits the width", async ({ page }) => {
    await seedAgent(page);
    await enterClassroom(page);
    await openTeacher(page);
    const dialog = teacherDialog(page);
    await expectOnTop(page.locator(id("teacher-input")), "teacher input");
    await expectOnTop(dialog.getByRole("button", { name: "Close" }), "Close");
    await expect(dialog.getByRole("button", { name: "Send" })).toBeVisible();
    await expectNoSideScroll(page);
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  });

  test("N3 the learning dialog's Close and steps are reachable and it fits the width", async ({ page }) => {
    await seedAgent(page);
    await enterClassroom(page);
    await place(page, STATION_SPOT);
    await page.keyboard.press(INTERACT_KEY);
    const dialog = learningDialog(page);
    await expect(dialog).toBeVisible();
    await expectOnTop(dialog.getByRole("button", { name: "Close" }), "Close");
    for (const title of ["Training data", "Training method", "Price check", "Cost limit and conditions", "Training request"]) {
      await expect(dialog.getByRole("region", { name: new RegExp(`· ${title}$`) })).toBeVisible();
    }
    await expectNoSideScroll(page);
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  });

  test("N4 the DOM catalog's next-step button fits the width", async ({ page }) => {
    await stubCatalog(page);
    await page.goto(paths.onboarding);
    await page.getByRole("button", { name: "List view" }).click();
    const next = page.getByRole("button", { name: /^(Next: name and appearance|Continue without a model)$/ });
    await expect(next).toBeVisible();
    const box = (await next.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await expectNoSideScroll(page);
  });

  test("K4 the classroom HUD and character card use English copy with no sentence periods", async ({ page }) => {
    await seedAgent(page);
    await enterClassroom(page);
    await place(page, TEACHER_SPOT);
    await openCharacterCard(page);
    await expectCleanCopy(page);
  });

  test("K5 the teacher and learning dialogs use English copy with no sentence periods", async ({ page }) => {
    await seedAgent(page);
    await enterClassroom(page);
    await openTeacher(page);
    await expectCleanCopy(page);
    await closeTeacher(page);
    await place(page, STATION_SPOT);
    await page.keyboard.press(INTERACT_KEY);
    await expect(learningDialog(page)).toBeVisible();
    await expectCleanCopy(page);
  });
});
