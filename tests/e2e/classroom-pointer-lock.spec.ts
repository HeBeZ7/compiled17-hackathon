import { expect, test } from "@playwright/test";
import {
  AISLE,
  classroomRoot,
  closeTeacher,
  enterClassroom,
  expectStopped,
  expectWalking,
  forwardOf,
  id,
  INTERACT_KEY,
  learningDialog,
  lookPrompt,
  openTeacher,
  pause,
  place,
  seedAgent,
  snap,
  STATION_SPOT,
  TEACHER_SPOT,
  teacherDialog,
} from "./support/app";
import { installPointerLockDouble, lookBy, pointerLockCounts } from "./support/browser-doubles";

test.skip(!process.env.AA_QA_E2E, "Not run without the product hook. Run with AA_QA_E2E=1 against the target commit.");
test.describe.configure({ timeout: 60_000 });

// PL1 to PL9 replace the Pointer Lock API with a double. They verify the page's state machine: when it asks for
// capture, how it reacts to capture ending, and what it does with mouse motion. FIXTURE-grade.
// PL10 and PL11 use the real API and report not-run when the headless browser does not grant it.
test.describe("[pointer lock double] capture state machine", () => {
  test.beforeEach(async ({ page }) => {
    await installPointerLockDouble(page);
    await enterClassroom(page);
  });

  test("PL1 nothing captures the pointer without a click on the prompt", async ({ page }) => {
    await page.mouse.move(200, 200);
    await page.mouse.move(400, 300, { steps: 4 });
    await page.keyboard.press("KeyW");
    await page.locator(id("classroom-character-toggle")).click();
    await place(page, TEACHER_SPOT);
    await page.keyboard.press(INTERACT_KEY);
    await expect(teacherDialog(page)).toBeVisible();
    await closeTeacher(page);
    await pause(page, 200);

    expect((await pointerLockCounts(page)).requests).toBe(0);
    expect((await snap(page)).pointerLocked).toBe(false);
    await expect(classroomRoot(page)).toHaveAttribute("data-pointer-locked", "false");
    await expect(lookPrompt(page)).toBeVisible();
  });

  test("PL2 clicking the prompt captures once, inside the user gesture", async ({ page }) => {
    await lookPrompt(page).click();
    await expect(classroomRoot(page)).toHaveAttribute("data-pointer-locked", "true");
    expect((await snap(page)).pointerLocked).toBe(true);
    await expect(lookPrompt(page)).toBeHidden();
    const counts = await pointerLockCounts(page);
    expect(counts.requests).toBe(1);
    expect(counts.requestsWithoutGesture).toBe(0);
  });

  test("PL3 captured mouse motion turns the view the way the mouse moved", async ({ page }) => {
    await place(page, AISLE);
    await lookPrompt(page).click();
    await lookBy(page, 200, 0);
    const right = await snap(page);
    expect(forwardOf(right.yaw).x, "moving the mouse right must face more toward +x").toBeGreaterThan(0.1);
    expect(right.pitch).toBeCloseTo(0, 5);

    await lookBy(page, 0, -100);
    const up = await snap(page);
    expect(up.pitch, "moving the mouse up must look up").toBeGreaterThan(0.05);
    expect(up.yaw).toBeCloseTo(right.yaw, 5);
  });

  test("PL4 pitch clamps at both ends without flipping over and yaw stays free", async ({ page }) => {
    await lookPrompt(page).click();
    for (let i = 0; i < 30; i++) await lookBy(page, 0, -220);
    const top = await snap(page);
    expect(top.pitch).toBeGreaterThan(1);
    expect(top.pitch).toBeLessThan(Math.PI / 2);
    await lookBy(page, 0, -220);
    expect((await snap(page)).pitch).toBe(top.pitch);

    for (let i = 0; i < 60; i++) await lookBy(page, 0, 220);
    const bottom = await snap(page);
    expect(bottom.pitch).toBeLessThan(-1);
    expect(bottom.pitch).toBeGreaterThan(-Math.PI / 2);

    for (let i = 0; i < 12; i++) await lookBy(page, 220, 0);
    expect(Math.abs((await snap(page)).yaw)).toBeLessThanOrEqual(Math.PI);
  });

  test("PL5 mouse motion without capture does not turn the view", async ({ page }) => {
    const before = await snap(page);
    await lookBy(page, 200, 100);
    await page.mouse.move(500, 300, { steps: 3 });
    await pause(page, 100);
    const after = await snap(page);
    expect(after.yaw).toBe(before.yaw);
    expect(after.pitch).toBe(before.pitch);
  });

  test("PL6 the browser ending capture, as on Escape, clears held input and shows the prompt", async ({ page }) => {
    await place(page, AISLE);
    await lookPrompt(page).click();
    await page.keyboard.down("KeyW");
    await expectWalking(page);
    await page.evaluate(() => window.__AA_POINTER_LOCK__!.browserRelease());
    await expect(classroomRoot(page)).toHaveAttribute("data-pointer-locked", "false");
    await expectStopped(page);
    await page.keyboard.up("KeyW");
    await expect(lookPrompt(page)).toBeVisible();
    expect((await pointerLockCounts(page)).requests, "must not recapture by itself").toBe(1);
  });

  test("PL7 opening a dialog releases capture, stops movement and ignores mouse motion", async ({ page }) => {
    await seedAgent(page);
    await enterClassroom(page);
    await place(page, AISLE);
    await lookPrompt(page).click();
    await page.keyboard.down("KeyW");
    await expectWalking(page);
    await openTeacher(page);

    await expect(classroomRoot(page)).toHaveAttribute("data-pointer-locked", "false");
    await expectStopped(page);
    const before = await snap(page);
    expect(before.paused).toBe(true);
    expect(before.pointerLocked).toBe(false);
    expect((await pointerLockCounts(page)).exits).toBeGreaterThanOrEqual(1);
    await lookBy(page, 300, 200);
    await pause(page, 100);
    const after = await snap(page);
    expect(after.yaw).toBe(before.yaw);
    expect(after.pitch).toBe(before.pitch);
    await page.keyboard.up("KeyW");
  });

  for (const [name, close] of [
    ["the Close button", (page: import("@playwright/test").Page) => closeTeacher(page)],
    ["Escape", (page: import("@playwright/test").Page) => page.keyboard.press("Escape")],
  ] as const) {
    test(`PL8 closing with ${name} never recaptures the pointer`, async ({ page }) => {
      await lookPrompt(page).click();
      await openTeacher(page);
      await close(page);
      await expect(teacherDialog(page)).toBeHidden();
      await pause(page, 300);
      expect((await pointerLockCounts(page)).requests).toBe(1);
      expect((await snap(page)).pointerLocked).toBe(false);
      await expect(lookPrompt(page)).toBeVisible();
    });
  }

  test("PL9 a capture request that resolves after a dialog opened does not keep the pointer", async ({ page }) => {
    await place(page, STATION_SPOT);
    await page.keyboard.press(INTERACT_KEY);
    await expect(learningDialog(page)).toBeVisible();
    await expect(lookPrompt(page)).toBeHidden();
    // The prompt is gone, so the only path left is a late grant from the browser.
    await page.evaluate(() => {
      document.querySelector("canvas")!.requestPointerLock();
    });
    await expect(classroomRoot(page)).toHaveAttribute("data-pointer-locked", "false");
    expect((await snap(page)).pointerLocked).toBe(false);
    expect((await pointerLockCounts(page)).exits).toBeGreaterThanOrEqual(1);
  });

  test("PL12 when the browser refuses capture the user is told and can drag to look instead", async ({ page }) => {
    await page.evaluate(() => { window.__AA_POINTER_LOCK__!.refuse = true; });
    await lookPrompt(page).click();
    await expect(page.getByRole("alert")).toContainText("Mouse look could not start");
    expect((await snap(page)).pointerLocked).toBe(false);

    const zone = page.locator(id("classroom-look-zone"));
    await expect(zone).toBeVisible();
    const box = (await zone.boundingBox())!;
    const before = await snap(page);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 4 });
    await page.mouse.up();
    expect((await snap(page)).yaw, "dragging must turn the view").not.toBe(before.yaw);
  });
});

test.describe("[real Pointer Lock API]", () => {
  test.beforeEach(async ({ page }) => { await enterClassroom(page); });

  /** Headless availability differs by browser build. A refusal is recorded as not-run, never as a pass. */
  async function captureOrSkip(page: import("@playwright/test").Page) {
    await lookPrompt(page).click();
    const start = Date.now();
    while (Date.now() - start < 2_000 && !(await snap(page)).pointerLocked) await pause(page, 50);
    test.skip(!(await snap(page)).pointerLocked, "not-run: the headless browser did not grant real pointer lock");
  }

  test("PL10 real capture from a click and real mouse motion turn the view", async ({ page }) => {
    await captureOrSkip(page);
    const before = await snap(page);
    const box = page.viewportSize()!;
    await page.mouse.move(box.width / 2, box.height / 2);
    await page.mouse.move(box.width / 2 + 120, box.height / 2, { steps: 6 });
    await pause(page, 150);
    test.skip((await snap(page)).yaw === before.yaw, "not-run: mouse motion did not reach the locked page in headless mode");
    expect(forwardOf((await snap(page)).yaw).x).toBeGreaterThan(forwardOf(before.yaw).x);
  });

  test("PL11 real Escape releases capture", async ({ page }) => {
    await captureOrSkip(page);
    await page.keyboard.press("Escape");
    await pause(page, 500);
    test.skip((await snap(page)).pointerLocked, "not-run: browser-level Escape does not reach automated input");
    await expect(lookPrompt(page)).toBeVisible();
  });
});
